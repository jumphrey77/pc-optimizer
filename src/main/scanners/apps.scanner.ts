import * as fs from 'fs'
import log from 'electron-log'
import { querySubkeys, queryValues, valMap } from '../utils/registry.helper'
import type { InstalledApp, Finding, ScanResult } from '../../shared/types'

const BLOATWARE_PATTERNS = [
  /mcafee/i, /norton/i, /avast\s+(?!cleanup)/i, /avg\s+/i,
  /cyberlink/i, /candy\s+crush/i, /bubble\s+witch/i, /farmville/i,
  /myasus/i, /hp\s+jumpstart/i, /dell\s+supportassist\s+os/i,
  /lenovo\s+vantage/i, /asus\s+gift\s+box/i, /amazon\s+assistant/i,
  /booking\.com/i, /trivago/i, /priceline/i, /wildtangent/i,
  /microsoft\s+bing\s+health/i, /netflix.*(?:app|for\s+windows)/i,
]

const RUNTIME_PATTERNS: Array<{ pattern: RegExp; type: InstalledApp['runtimeType'] }> = [
  { pattern: /microsoft\s+\.net\s+\d/i,          type: 'dotnet' },
  { pattern: /microsoft\s+visual\s+c\+\+\s+\d/i, type: 'vcredist' },
  { pattern: /java\s+(se\s+)?runtime/i,           type: 'java' },
  { pattern: /java\s+\d+\s+(update|\()/i,         type: 'java' },
]

const UNINSTALL_KEYS = [
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]

function extractExe(s: string): string {
  const q = s.match(/^"([^"]+)"/)
  if (q) return q[1]
  const sp = s.indexOf(' ')
  return sp > 0 ? s.slice(0, sp) : s
}

function slug(s: string): string {
  return s.slice(-12).replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

/** Yield control back to event loop between chunks to prevent freezing */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = []
  const seen = new Set<string>()

  for (const parentKey of UNINSTALL_KEYS) {
    try {
      const subkeys = querySubkeys(parentKey)

      // Process in chunks of 20 to keep event loop responsive
      const CHUNK = 20
      for (let i = 0; i < subkeys.length; i += CHUNK) {
        await yieldToEventLoop()
        const chunk = subkeys.slice(i, i + CHUNK)

        for (const sk of chunk) {
          try {
            const values = queryValues(sk)
            const m = valMap(values)
            const name = m['displayname']?.trim()
            if (!name) continue
            if (seen.has(name.toLowerCase())) continue
            seen.add(name.toLowerCase())
            if (m['systemcomponent'] === '1') continue
            if (m['releasetype'] === 'Security Update' || m['releasetype'] === 'Update') continue
            if (m['parentkeyname']) continue

            const uninstallStr = m['uninstallstring'] || ''
            const sizeKb = parseInt(m['estimatedsize'] || '0')

            let isBrokenInstall = false
            if (uninstallStr) {
              const exePath = extractExe(uninstallStr)
              isBrokenInstall = !!exePath && exePath.endsWith('.exe') && !fs.existsSync(exePath)
            }

            const isBloatware = BLOATWARE_PATTERNS.some(p => p.test(name))
            let runtimeType: InstalledApp['runtimeType'] = null
            for (const { pattern, type } of RUNTIME_PATTERNS) {
              if (pattern.test(name)) { runtimeType = type; break }
            }

            apps.push({
              id: sk,
              name,
              publisher:       m['publisher'] || undefined,
              version:         m['displayversion'] || undefined,
              installDate:     m['installdate'] || undefined,
              installLocation: m['installlocation'] || undefined,
              estimatedSize:   sizeKb ? sizeKb * 1024 : undefined,
              uninstallString: uninstallStr || undefined,
              isBloatware,
              isBrokenInstall,
              runtimeType,
              startupImpact:   'none',
            })
          } catch { /* skip bad entry */ }
        }
      }
    } catch (e) {
      log.warn(`getInstalledApps key error: ${parentKey}`, e)
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

export async function scanApps(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const findings: Finding[] = []
  const errors: string[] = []

  try {
    const apps = await getInstalledApps()

    for (const app of apps.filter(a => a.isBloatware)) {
      findings.push({
        id: `app-bloat-${slug(app.id)}`, module: 'apps', severity: 'low',
        title: `Potential bloatware: ${app.name}`,
        description: 'Commonly pre-installed by OEMs or bundled with hardware.',
        evidence: [app.name, app.publisher || 'Unknown publisher'],
        fixType: 'guided', requiresElevation: false, rollbackSupported: false,
      })
    }

    for (const app of apps.filter(a => a.isBrokenInstall)) {
      findings.push({
        id: `app-broken-${slug(app.id)}`, module: 'apps', severity: 'medium',
        title: `Broken uninstall entry: ${app.name}`,
        description: 'Uninstall entry points to an executable that no longer exists.',
        evidence: [app.uninstallString || 'No uninstall string'],
        fixType: 'automatic', requiresElevation: true, rollbackSupported: true,
        rollbackPlan: 'Registry key exported as .reg before removal.',
      })
    }

    const runtimesByType: Record<string, InstalledApp[]> = {}
    for (const app of apps.filter(a => a.runtimeType)) {
      const k = app.runtimeType!
      if (!runtimesByType[k]) runtimesByType[k] = []
      runtimesByType[k].push(app)
    }
    for (const [type, rApps] of Object.entries(runtimesByType)) {
      if (rApps.length > 4) {
        const label = type === 'dotnet' ? '.NET' : type === 'vcredist' ? 'VC++ Redistributable' : 'Java'
        findings.push({
          id: `app-runtime-${type}`, module: 'apps', severity: 'info',
          title: `${rApps.length} versions of ${label} installed`,
          description: 'Multiple runtime versions are normal. Review before removing any.',
          evidence: rApps.map(a => a.name),
          fixType: 'manual', requiresElevation: false, rollbackSupported: false,
        })
      }
    }

    const pdfReaders = apps.filter(a =>
      /pdf/i.test(a.name) && /(reader|viewer|editor)/i.test(a.name)
    )
    if (pdfReaders.length > 1) {
      findings.push({
        id: 'app-dup-pdf', module: 'apps', severity: 'low',
        title: `${pdfReaders.length} PDF readers installed`,
        description: 'Consider keeping only one.',
        evidence: pdfReaders.map(a => a.name),
        fixType: 'manual', requiresElevation: false, rollbackSupported: false,
      })
    }

  } catch (e: any) {
    errors.push(e.message)
    log.error('scanApps error', e)
  }

  return { module: 'apps', startedAt, completedAt: new Date().toISOString(), findings, errors }
}
