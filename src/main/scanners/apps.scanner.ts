import * as Registry from 'winreg'
import * as fs from 'fs'
import log from 'electron-log'
import type { InstalledApp, Finding, ScanResult } from '../../shared/types'

// Known OEM/bloatware publishers and name patterns
const BLOATWARE_PATTERNS = [
  /mcafee/i, /norton/i, /avast\s+(?!cleanup)/i, /avg\s+/i,
  /cyberlink/i, /netflix.*app/i, /candy\s+crush/i, /bubble\s+witch/i,
  /farmville/i, /myasus/i, /hp\s+jumpstart/i, /dell\s+supportassist\s+os/i,
  /lenovo\s+vantage/i, /samsung\s+magician/i, /asus\s+gift\s+box/i,
  /icloud.*for\s+windows.*\bcontact\b/i, /amazon\s+assistant/i,
  /booking\.com/i, /trivago/i, /priceline/i, /expedia/i,
  /wildtangent/i, /gamelauncher/i, /microsoft\s+bing\s+health/i,
]

const RUNTIME_PATTERNS: Array<{ pattern: RegExp; type: InstalledApp['runtimeType'] }> = [
  { pattern: /microsoft\s+\.net\s+\d/i, type: 'dotnet' },
  { pattern: /microsoft\s+visual\s+c\+\+\s+\d/i, type: 'vcredist' },
  { pattern: /java\s+(se\s+)?runtime/i, type: 'java' },
  { pattern: /java\s+\d+/i, type: 'java' },
]

const UNINSTALL_KEYS = [
  { hive: Registry.HKLM, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
  { hive: Registry.HKLM, key: '\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
  { hive: Registry.HKCU, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
]

function readRegKey(hive: string, key: string): Promise<Registry.Registry> {
  return new Promise((resolve, reject) => {
    const reg = new (Registry as any)({ hive, key })
    resolve(reg)
  })
}

async function getSubkeys(reg: Registry.Registry): Promise<Registry.Registry[]> {
  return new Promise((resolve) => {
    reg.keys((err, items) => {
      if (err) resolve([])
      else resolve(items || [])
    })
  })
}

async function getValues(reg: Registry.Registry): Promise<Registry.RegistryItem[]> {
  return new Promise((resolve) => {
    reg.values((err, items) => {
      if (err) resolve([])
      else resolve(items || [])
    })
  })
}

function valMap(items: Registry.RegistryItem[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const item of items) {
    m[item.name.toLowerCase()] = item.value
  }
  return m
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = []
  const seen = new Set<string>()

  for (const { hive, key } of UNINSTALL_KEYS) {
    try {
      const reg = new (Registry as any)({ hive, key })
      const subkeys = await getSubkeys(reg)

      for (const sub of subkeys) {
        const values = await getValues(sub)
        const m = valMap(values)

        const name = m['displayname']
        if (!name || name.trim() === '') continue
        if (seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())

        // Skip Windows system components
        if (m['systemcomponent'] === '1') continue
        if (m['releaseType'] === 'Security Update' || m['releaseType'] === 'Update') continue

        const uninstallStr = m['uninstallstring'] || ''
        const installLoc = m['installlocation'] || ''
        const sizeKb = parseInt(m['estimatedsize'] || '0')

        const isBrokenInstall = uninstallStr !== '' && !fs.existsSync(
          uninstallStr.replace(/^"(.+)".*$/, '$1').replace(/\s.*$/, '')
        )

        const isBloatware = BLOATWARE_PATTERNS.some(p => p.test(name))

        let runtimeType: InstalledApp['runtimeType'] = null
        for (const { pattern, type } of RUNTIME_PATTERNS) {
          if (pattern.test(name)) { runtimeType = type; break }
        }

        apps.push({
          id: sub.key,
          name,
          publisher: m['publisher'],
          version: m['displayversion'],
          installDate: m['installdate'],
          installLocation: installLoc || undefined,
          estimatedSize: sizeKb ? sizeKb * 1024 : undefined,
          uninstallString: uninstallStr || undefined,
          isBloatware,
          isBrokenInstall,
          runtimeType,
          startupImpact: 'none'
        })
      }
    } catch (e) {
      log.warn(`getInstalledApps key error: ${key}`, e)
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

    // Bloatware
    const bloatware = apps.filter(a => a.isBloatware)
    for (const app of bloatware) {
      findings.push({
        id: `app-bloat-${app.id.slice(-8)}`,
        module: 'apps',
        severity: 'low',
        title: `Potential bloatware: ${app.name}`,
        description: 'This app is commonly pre-installed by OEMs or bundled with hardware and may not be needed.',
        evidence: [app.name, app.publisher || 'Unknown publisher'],
        fixType: 'guided',
        requiresElevation: false,
        rollbackSupported: false,
        rollbackPlan: 'Use the app\'s own installer if you need it back.'
      })
    }

    // Broken installs
    const broken = apps.filter(a => a.isBrokenInstall)
    for (const app of broken) {
      findings.push({
        id: `app-broken-${app.id.slice(-8)}`,
        module: 'apps',
        severity: 'medium',
        title: `Broken uninstall entry: ${app.name}`,
        description: 'This app has an uninstall entry but the executable no longer exists. It\'s a leftover from a partial uninstall.',
        evidence: [app.uninstallString || 'No uninstall string', app.id],
        fixType: 'automatic',
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: 'Registry key will be backed up as a .reg file before removal.'
      })
    }

    // Old runtimes - identify duplicates
    const runtimesByType: Record<string, InstalledApp[]> = {}
    for (const app of apps.filter(a => a.runtimeType)) {
      const key = app.runtimeType!
      if (!runtimesByType[key]) runtimesByType[key] = []
      runtimesByType[key].push(app)
    }

    for (const [type, rApps] of Object.entries(runtimesByType)) {
      if (rApps.length > 4) {
        const label = type === 'dotnet' ? '.NET' : type === 'vcredist' ? 'VC++ Redistributable' : 'Java'
        findings.push({
          id: `app-runtime-${type}`,
          module: 'apps',
          severity: 'info',
          title: `${rApps.length} versions of ${label} installed`,
          description: `Multiple runtime versions are normal — apps depend on specific versions. Review before removing any.`,
          evidence: rApps.map(a => a.name),
          fixType: 'manual',
          requiresElevation: false,
          rollbackSupported: false,
        })
      }
    }

    // Duplicate purpose detection (multiple entries with similar names)
    const pdfReaders = apps.filter(a =>
      /pdf/i.test(a.name) && /(reader|viewer|editor)/i.test(a.name)
    )
    if (pdfReaders.length > 1) {
      findings.push({
        id: 'app-dup-pdf',
        module: 'apps',
        severity: 'low',
        title: `${pdfReaders.length} PDF readers installed`,
        description: 'You have multiple PDF apps installed. Consider keeping only one.',
        evidence: pdfReaders.map(a => a.name),
        fixType: 'manual',
        requiresElevation: false,
        rollbackSupported: false,
      })
    }

  } catch (e: any) {
    errors.push(e.message)
    log.error('scanApps error', e)
  }

  return {
    module: 'apps',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    errors
  }
}
