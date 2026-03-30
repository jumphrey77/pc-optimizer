import * as fs from 'fs'
import log from 'electron-log'
import { queryValues, querySubkeyValues, valMap } from '../utils/registry.helper'
import type { Finding, ScanResult } from '../../shared/types'

function extractExe(s: string): string {
  const q = s.match(/^"([^"]+)"/)
  if (q) return q[1]
  const sp = s.indexOf(' ')
  return sp > 0 ? s.slice(0, sp) : s
}

function checkRunKeys(): Finding[] {
  const findings: Finding[] = []
  const RUN_KEYS = [
    { key: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',      hive: 'HKLM' },
    { key: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',  hive: 'HKLM' },
    { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',      hive: 'HKCU' },
  ]
  for (const { key, hive } of RUN_KEYS) {
    try {
      const values = queryValues(key)
      for (const v of values) {
        const exePath = extractExe(v.value)
        if (!exePath) continue
        if (!fs.existsSync(exePath)) {
          findings.push({
            id: `reg-run-missing-${hive}-${v.name}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
            module: 'registry', severity: 'medium',
            title: `Run key points to missing file: ${v.name}`,
            description: `Startup entry references "${exePath}" which no longer exists.`,
            evidence: [`${key}`, `${v.name} = ${v.value}`],
            fixType: 'automatic',
            requiresElevation: hive === 'HKLM',
            rollbackSupported: true,
            rollbackPlan: 'Registry value exported as .reg backup before deletion.',
          })
        }
      }
    } catch { /* skip inaccessible key */ }
  }
  return findings
}

function checkUninstallEntries(): Finding[] {
  const findings: Finding[] = []
  const UNINSTALL_KEYS = [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const parentKey of UNINSTALL_KEYS) {
    try {
      const subkeys = querySubkeyValues(parentKey)
      for (const [subkeyPath, values] of subkeys) {
        const m = valMap(values)
        const name = m['displayname']
        if (!name) continue
        const uninstall = m['uninstallstring']
        if (!uninstall) {
          findings.push({
            id: `reg-uninstall-nostr-${subkeyPath.slice(-16).replace(/[^a-z0-9]/gi, '-')}`,
            module: 'registry', severity: 'low',
            title: `Orphaned uninstall entry: ${name}`,
            description: 'App appears in Programs & Features but has no uninstall command.',
            evidence: [subkeyPath, name],
            fixType: 'automatic', requiresElevation: true, rollbackSupported: true,
            rollbackPlan: 'Registry key exported as .reg before removal.',
          })
        } else {
          const exePath = extractExe(uninstall)
          if (exePath && exePath.endsWith('.exe') && !fs.existsSync(exePath)) {
            findings.push({
              id: `reg-uninstall-broken-${subkeyPath.slice(-16).replace(/[^a-z0-9]/gi, '-')}`,
              module: 'registry', severity: 'medium',
              title: `Broken uninstaller: ${name}`,
              description: `Uninstaller executable for "${name}" no longer exists.`,
              evidence: [uninstall, exePath],
              fixType: 'automatic', requiresElevation: true, rollbackSupported: true,
              rollbackPlan: 'Registry key exported as .reg before removal.',
            })
          }
        }
      }
    } catch { /* skip */ }
  }
  return findings
}

function checkFileAssociations(): Finding[] {
  const findings: Finding[] = []
  try {
    const subkeys = querySubkeyValues('HKCU\\Software\\Classes')
    let brokenCount = 0
    const brokenNames: string[] = []
    let checked = 0
    for (const [skPath] of subkeys) {
      if (checked++ > 80) break
      const ext = skPath.split('\\').pop() || ''
      if (!ext.startsWith('.')) continue
      try {
        const cmdValues = queryValues(`${skPath}\\shell\\open\\command`)
        if (cmdValues.length > 0) {
          const exePath = extractExe(cmdValues[0].value)
          if (exePath && exePath.endsWith('.exe') && !fs.existsSync(exePath)) {
            brokenCount++
            brokenNames.push(`${ext} → ${exePath}`)
          }
        }
      } catch { /* skip */ }
    }
    if (brokenCount > 0) {
      findings.push({
        id: 'reg-broken-associations', module: 'registry',
        severity: brokenCount > 5 ? 'medium' : 'low',
        title: `${brokenCount} broken file associations`,
        description: 'File types with handlers pointing to apps no longer installed.',
        evidence: brokenNames.slice(0, 10),
        fixType: 'guided', requiresElevation: false, rollbackSupported: true,
        rollbackPlan: 'Affected keys exported as .reg before changes.',
      })
    }
  } catch { /* skip */ }
  return findings
}

export async function scanRegistry(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const errors: string[] = []
  let findings: Finding[] = []
  try {
    findings = [
      ...checkRunKeys(),
      ...checkUninstallEntries(),
      ...checkFileAssociations(),
    ]
  } catch (e: any) {
    errors.push(e.message)
    log.error('scanRegistry error', e)
  }
  return { module: 'registry', startedAt, completedAt: new Date().toISOString(), findings, errors }
}
