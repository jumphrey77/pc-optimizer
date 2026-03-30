import * as Registry from 'winreg'
import * as fs from 'fs'
import log from 'electron-log'
import type { Finding, ScanResult } from '../../shared/types'

async function getValues(hive: string, key: string): Promise<Registry.RegistryItem[]> {
  return new Promise((resolve) => {
    const reg = new (Registry as any)({ hive, key })
    reg.values((err: any, items: Registry.RegistryItem[]) => {
      resolve(err || !items ? [] : items)
    })
  })
}

async function getSubkeys(hive: string, key: string): Promise<Registry.Registry[]> {
  return new Promise((resolve) => {
    const reg = new (Registry as any)({ hive, key })
    reg.keys((err: any, items: Registry.Registry[]) => {
      resolve(err || !items ? [] : items)
    })
  })
}

function extractExePath(val: string): string {
  const quoted = val.match(/^"([^"]+)"/)
  if (quoted) return quoted[1]
  const space = val.indexOf(' ')
  return space > 0 ? val.slice(0, space) : val
}

async function checkRunKeys(hive: string, label: string): Promise<Finding[]> {
  const findings: Finding[] = []
  const RUN_KEYS = [
    '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    '\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  ]
  for (const key of RUN_KEYS) {
    try {
      const values = await getValues(hive, key)
      for (const v of values) {
        const exePath = extractExePath(v.value)
        if (!exePath) continue
        if (!fs.existsSync(exePath)) {
          findings.push({
            id: `reg-run-missing-${hive}-${v.name}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
            module: 'registry',
            severity: 'medium',
            title: `Run key points to missing file: ${v.name}`,
            description: `A startup registry entry references "${exePath}" which no longer exists on disk.`,
            evidence: [`${label}\\${key.split('\\').pop()}`, `${v.name} = ${v.value}`],
            fixType: 'automatic',
            requiresElevation: hive === Registry.HKLM,
            rollbackSupported: true,
            rollbackPlan: 'The registry value will be exported as a .reg backup before deletion.'
          })
        }
      }
    } catch { /* skip inaccessible key */ }
  }
  return findings
}

async function checkUninstallEntries(): Promise<Finding[]> {
  const findings: Finding[] = []
  const UNINSTALL_KEYS = [
    { hive: Registry.HKLM, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
    { hive: Registry.HKLM, key: '\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
  ]
  for (const { hive, key } of UNINSTALL_KEYS) {
    try {
      const subkeys = await getSubkeys(hive, key)
      for (const sub of subkeys) {
        const values = await new Promise<Registry.RegistryItem[]>(resolve => {
          sub.values((err: any, items: Registry.RegistryItem[]) => resolve(err ? [] : items || []))
        })
        const m: Record<string, string> = {}
        for (const v of values) m[v.name.toLowerCase()] = v.value

        const name = m['displayname']
        if (!name) continue

        const uninstall = m['uninstallstring']
        if (!uninstall) {
          findings.push({
            id: `reg-uninstall-nostr-${sub.key.slice(-16).replace(/[^a-z0-9]/gi, '-')}`,
            module: 'registry',
            severity: 'low',
            title: `Orphaned uninstall entry: ${name}`,
            description: 'This app appears in Programs & Features but has no uninstall command. It may be a leftover from a previous installation.',
            evidence: [sub.key, name],
            fixType: 'automatic',
            requiresElevation: true,
            rollbackSupported: true,
            rollbackPlan: 'Registry key exported as .reg before removal.'
          })
        } else {
          const exePath = extractExePath(uninstall)
          if (exePath && exePath.endsWith('.exe') && !fs.existsSync(exePath)) {
            findings.push({
              id: `reg-uninstall-broken-${sub.key.slice(-16).replace(/[^a-z0-9]/gi, '-')}`,
              module: 'registry',
              severity: 'medium',
              title: `Broken uninstaller: ${name}`,
              description: `The uninstaller executable for "${name}" no longer exists. The app cannot be uninstalled normally.`,
              evidence: [uninstall, exePath],
              fixType: 'automatic',
              requiresElevation: true,
              rollbackSupported: true,
              rollbackPlan: 'Registry key exported as .reg before removal.'
            })
          }
        }
      }
    } catch { /* skip */ }
  }
  return findings
}

async function checkFileAssociations(): Promise<Finding[]> {
  const findings: Finding[] = []
  try {
    const subkeys = await getSubkeys(Registry.HKCU, '\\Software\\Classes')
    let brokenCount = 0
    const brokenNames: string[] = []
    for (const sub of subkeys.slice(0, 100)) {
      const name = sub.key.split('\\').pop() || ''
      if (!name.startsWith('.')) continue
      try {
        const openCmd = await getValues(sub.hive, sub.key + '\\shell\\open\\command')
        if (openCmd.length > 0) {
          const exePath = extractExePath(openCmd[0].value)
          if (exePath && exePath.endsWith('.exe') && !fs.existsSync(exePath)) {
            brokenCount++
            brokenNames.push(`${name} → ${exePath}`)
          }
        }
      } catch { /* skip */ }
    }
    if (brokenCount > 0) {
      findings.push({
        id: 'reg-broken-associations',
        module: 'registry',
        severity: brokenCount > 5 ? 'medium' : 'low',
        title: `${brokenCount} broken file associations`,
        description: 'These file types have custom open handlers that point to apps no longer installed. Double-clicking these file types will show an error.',
        evidence: brokenNames.slice(0, 10),
        fixType: 'guided',
        requiresElevation: false,
        rollbackSupported: true,
        rollbackPlan: 'Affected keys exported as .reg before any changes.'
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
    const [hklmRun, hkcuRun, uninstall, associations] = await Promise.all([
      checkRunKeys(Registry.HKLM, 'HKLM'),
      checkRunKeys(Registry.HKCU, 'HKCU'),
      checkUninstallEntries(),
      checkFileAssociations(),
    ])
    findings = [...hklmRun, ...hkcuRun, ...uninstall, ...associations]
  } catch (e: any) {
    errors.push(e.message)
    log.error('scanRegistry error', e)
  }

  return {
    module: 'registry',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    errors
  }
}
