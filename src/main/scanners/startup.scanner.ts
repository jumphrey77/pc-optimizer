import * as Registry from 'winreg'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import log from 'electron-log'
import type { StartupEntry, StartupTrust, Finding, ScanResult } from '../../shared/types'

const STARTUP_REG_KEYS = [
  { hive: Registry.HKLM, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', label: 'HKLM\\Run' },
  { hive: Registry.HKLM, key: '\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', label: 'HKLM\\Run (32-bit)' },
  { hive: Registry.HKCU, key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', label: 'HKCU\\Run' },
]

const STARTUP_FOLDERS = [
  path.join(process.env.ALLUSERSPROFILE || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\StartUp'),
  path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup')
]

const MS_PUBLISHERS = [
  'microsoft', 'windows', 'explorer', 'ctfmon', 'svchost',
  'onedrive', 'teams', 'msedge', 'msedgewebview'
]

const SUSPICIOUS_PATTERNS = [
  /\\temp\\/i, /\\appdata\\local\\temp\\/i,
  /\.vbs$/i, /\.bat$/i, /\.cmd$/i,
  /rundll32.*[a-f0-9]{32}/i,
  /powershell.*-enc/i, /powershell.*hidden/i,
]

function extractExePath(command: string): string {
  const quoted = command.match(/^"([^"]+)"/)
  if (quoted) return quoted[1]
  return command.split(' ')[0]
}

function getTrust(command: string, name: string): StartupTrust {
  const lower = command.toLowerCase() + name.toLowerCase()

  if (SUSPICIOUS_PATTERNS.some(p => p.test(command))) return 'suspicious'

  if (MS_PUBLISHERS.some(ms => lower.includes(ms))) return 'microsoft'

  const exePath = extractExePath(command)
  if (fs.existsSync(exePath)) {
    const programFiles = (process.env['ProgramFiles'] || 'C:\\Program Files').toLowerCase()
    const programFilesX86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase()
    const exeLower = exePath.toLowerCase()
    if (exeLower.startsWith(programFiles) || exeLower.startsWith(programFilesX86)) {
      return 'verified'
    }
  }

  return 'unknown'
}

async function getRegistryStartupEntries(): Promise<StartupEntry[]> {
  const entries: StartupEntry[] = []

  for (const { hive, key, label } of STARTUP_REG_KEYS) {
    try {
      const reg = new (Registry as any)({ hive, key })
      await new Promise<void>((resolve) => {
        reg.values((err: any, items: Registry.RegistryItem[]) => {
          if (err || !items) { resolve(); return }
          for (const item of items) {
            const command = item.value
            const exePath = extractExePath(command)
            entries.push({
              id: `reg-${hive}-${item.name}`.replace(/[^a-z0-9-]/gi, '-'),
              name: item.name,
              command,
              location: label,
              trust: getTrust(command, item.name),
              enabled: true,
              pathExists: fs.existsSync(exePath),
              impact: 'medium'
            })
          }
          resolve()
        })
      })
    } catch (e) {
      log.warn(`startup reg scan error: ${label}`, e)
    }
  }

  return entries
}

function getFolderStartupEntries(): StartupEntry[] {
  const entries: StartupEntry[] = []

  for (const folder of STARTUP_FOLDERS) {
    if (!fs.existsSync(folder)) continue
    try {
      const files = fs.readdirSync(folder)
      for (const file of files) {
        const full = path.join(folder, file)
        entries.push({
          id: `folder-${full.replace(/[^a-z0-9]/gi, '-')}`,
          name: file.replace(/\.[^.]+$/, ''),
          command: full,
          location: folder,
          trust: getTrust(full, file),
          enabled: true,
          pathExists: fs.existsSync(full),
          impact: 'low'
        })
      }
    } catch { /* skip */ }
  }

  return entries
}

async function getScheduledTaskEntries(): Promise<StartupEntry[]> {
  const entries: StartupEntry[] = []
  try {
    const raw = execSync('schtasks /query /fo CSV /nh 2>nul', { timeout: 15000 }).toString()
    const lines = raw.split('\n').filter(l => l.trim())
    for (const line of lines.slice(0, 200)) {
      const cols = line.split('","').map(c => c.replace(/^"|"$/g, ''))
      if (cols.length < 3) continue
      const [name, nextRun, status] = cols
      if (!name || name.startsWith('\\Microsoft\\Windows\\')) continue
      const trust = name.toLowerCase().includes('microsoft') ? 'microsoft' : 'unknown'
      entries.push({
        id: `task-${name.replace(/[^a-z0-9]/gi, '-')}`,
        name: path.basename(name),
        command: name,
        location: 'Task Scheduler',
        trust,
        enabled: status !== 'Disabled',
        pathExists: true,
        impact: 'low'
      })
    }
  } catch (e) {
    log.warn('schtasks query failed', e)
  }
  return entries
}

export async function getStartupEntries(): Promise<StartupEntry[]> {
  const [regEntries, folderEntries] = await Promise.all([
    getRegistryStartupEntries(),
    Promise.resolve(getFolderStartupEntries())
  ])
  return [...regEntries, ...folderEntries]
}

export async function scanStartup(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const findings: Finding[] = []
  const errors: string[] = []

  try {
    const entries = await getStartupEntries()

    // Missing path entries
    const missingPath = entries.filter(e => !e.pathExists && e.enabled)
    for (const entry of missingPath) {
      findings.push({
        id: `startup-missing-${entry.id}`,
        module: 'startup',
        severity: 'medium',
        title: `Startup entry points to missing file: ${entry.name}`,
        description: 'This startup entry references a file that no longer exists. It can be safely removed.',
        evidence: [entry.command, entry.location],
        fixType: 'automatic',
        requiresElevation: entry.location.includes('HKLM'),
        rollbackSupported: true,
        rollbackPlan: 'Registry key or shortcut will be backed up before removal.'
      })
    }

    // Suspicious entries
    const suspicious = entries.filter(e => e.trust === 'suspicious')
    for (const entry of suspicious) {
      findings.push({
        id: `startup-sus-${entry.id}`,
        module: 'startup',
        severity: 'high',
        title: `Suspicious startup entry: ${entry.name}`,
        description: 'This entry has characteristics commonly associated with malicious software. Review carefully before dismissing.',
        evidence: [entry.command, entry.location],
        fixType: 'guided',
        requiresElevation: entry.location.includes('HKLM'),
        rollbackSupported: true,
        rollbackPlan: 'Entry backed up before any action.'
      })
    }

    // Unknown entries count
    const unknownCount = entries.filter(e => e.trust === 'unknown' && e.pathExists).length
    if (unknownCount > 5) {
      findings.push({
        id: 'startup-many-unknown',
        module: 'startup',
        severity: 'info',
        title: `${unknownCount} unknown startup programs`,
        description: 'You have many startup items from unverified publishers. Review each to identify what you need.',
        evidence: entries.filter(e => e.trust === 'unknown' && e.pathExists).map(e => e.name),
        fixType: 'manual',
        requiresElevation: false,
        rollbackSupported: false,
      })
    }

  } catch (e: any) {
    errors.push(e.message)
    log.error('scanStartup error', e)
  }

  return {
    module: 'startup',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    errors
  }
}
