import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import log from 'electron-log'
import { queryValues } from '../utils/registry.helper'
import type { StartupEntry, StartupTrust, Finding, ScanResult } from '../../shared/types'

const STARTUP_REG_KEYS = [
  { key: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',             label: 'HKLM\\Run' },
  { key: 'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', label: 'HKLM\\Run (32-bit)' },
  { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',             label: 'HKCU\\Run' },
]

const STARTUP_FOLDERS = [
  path.join(process.env.ALLUSERSPROFILE || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\StartUp'),
  path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'),
]

const MS_TOKENS = ['microsoft', 'windows', 'explorer', 'ctfmon', 'svchost', 'onedrive', 'teams', 'msedge']
const SUSPICIOUS_PATTERNS = [
  /\\temp\\/i, /\\appdata\\local\\temp\\/i,
  /\.vbs$/i, /\.bat$/i, /\.cmd$/i,
  /powershell.*-enc/i, /powershell.*hidden/i,
]

function extractExe(cmd: string): string {
  const q = cmd.match(/^"([^"]+)"/)
  if (q) return q[1]
  return cmd.split(' ')[0]
}

function getTrust(cmd: string, name: string): StartupTrust {
  if (SUSPICIOUS_PATTERNS.some(p => p.test(cmd))) return 'suspicious'
  const lower = (cmd + name).toLowerCase()
  if (MS_TOKENS.some(t => lower.includes(t))) return 'microsoft'
  const exePath = extractExe(cmd)
  if (fs.existsSync(exePath)) {
    const pf  = (process.env['ProgramFiles'] || 'C:\\Program Files').toLowerCase()
    const pf86 = (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)').toLowerCase()
    if (exePath.toLowerCase().startsWith(pf) || exePath.toLowerCase().startsWith(pf86)) return 'verified'
  }
  return 'unknown'
}

async function getRegistryStartupEntries(): Promise<StartupEntry[]> {
  const entries: StartupEntry[] = []
  for (const { key, label } of STARTUP_REG_KEYS) {
    try {
      const values = queryValues(key)
      for (const v of values) {
        const cmd = v.value
        const exePath = extractExe(cmd)
        entries.push({
          id: `reg-${key}-${v.name}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
          name: v.name,
          command: cmd,
          location: label,
          trust: getTrust(cmd, v.name),
          enabled: true,
          pathExists: fs.existsSync(exePath),
          impact: 'medium',
        })
      }
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
      for (const file of fs.readdirSync(folder)) {
        const full = path.join(folder, file)
        entries.push({
          id: `folder-${full.replace(/[^a-z0-9]/gi, '-')}`,
          name: file.replace(/\.[^.]+$/, ''),
          command: full,
          location: folder,
          trust: getTrust(full, file),
          enabled: true,
          pathExists: fs.existsSync(full),
          impact: 'low',
        })
      }
    } catch { /* skip */ }
  }
  return entries
}

export async function getStartupEntries(): Promise<StartupEntry[]> {
  const [reg, folder] = await Promise.all([
    getRegistryStartupEntries(),
    Promise.resolve(getFolderStartupEntries()),
  ])
  return [...reg, ...folder]
}

export async function scanStartup(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const findings: Finding[] = []
  const errors: string[] = []
  try {
    const entries = await getStartupEntries()
    for (const e of entries.filter(e => !e.pathExists && e.enabled)) {
      findings.push({
        id: `startup-missing-${e.id}`, module: 'startup', severity: 'medium',
        title: `Startup entry points to missing file: ${e.name}`,
        description: 'References a file that no longer exists. Safe to remove.',
        evidence: [e.command, e.location],
        fixType: 'automatic',
        requiresElevation: e.location.includes('HKLM'),
        rollbackSupported: true,
        rollbackPlan: 'Registry key or shortcut backed up before removal.',
      })
    }
    for (const e of entries.filter(e => e.trust === 'suspicious')) {
      findings.push({
        id: `startup-sus-${e.id}`, module: 'startup', severity: 'high',
        title: `Suspicious startup entry: ${e.name}`,
        description: 'Has characteristics associated with malicious software. Review carefully.',
        evidence: [e.command, e.location],
        fixType: 'guided',
        requiresElevation: e.location.includes('HKLM'),
        rollbackSupported: true,
        rollbackPlan: 'Entry backed up before any action.',
      })
    }
    const unknownCount = entries.filter(e => e.trust === 'unknown' && e.pathExists).length
    if (unknownCount > 5) {
      findings.push({
        id: 'startup-many-unknown', module: 'startup', severity: 'info',
        title: `${unknownCount} unknown startup programs`,
        description: 'Many startup items from unverified publishers. Review each.',
        evidence: entries.filter(e => e.trust === 'unknown' && e.pathExists).map(e => e.name),
        fixType: 'manual', requiresElevation: false, rollbackSupported: false,
      })
    }
  } catch (e: any) {
    errors.push(e.message)
    log.error('scanStartup error', e)
  }
  return { module: 'startup', startedAt, completedAt: new Date().toISOString(), findings, errors }
}
