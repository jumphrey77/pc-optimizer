import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import * as Registry from 'winreg'
import log from 'electron-log'
import { appendActionLog, exportRegistryKey } from '../rollback/rollback.engine'

interface FixResult {
  success: boolean
  error?: string
  bytesSaved?: number
}

// ─── Disk fixes ──────────────────────────────────────────────────────────────

async function fixDeleteDir(dirPath: string, findingId: string, findingTitle: string): Promise<FixResult> {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Path no longer exists' }
    }
    const sizeBefore = getDirSize(dirPath)
    // Delete contents but not the directory itself (safer for system folders)
    const entries = fs.readdirSync(dirPath)
    let deleted = 0
    for (const entry of entries) {
      const full = path.join(dirPath, entry)
      try {
        fs.rmSync(full, { recursive: true, force: true })
        deleted++
      } catch { /* skip locked files */ }
    }
    appendActionLog(findingId, findingTitle, 'fix', 'success',
      `Cleared ${deleted} items from ${dirPath}`, undefined)
    return { success: true, bytesSaved: sizeBefore }
  } catch (e: any) {
    log.error('fixDeleteDir', e)
    return { success: false, error: e.message }
  }
}

// ─── Registry fixes ──────────────────────────────────────────────────────────

async function fixDeleteRegistryValue(
  hive: string, key: string, valueName: string,
  findingId: string, findingTitle: string
): Promise<FixResult> {
  try {
    // Backup first
    const backupFile = exportRegistryKey(hive, key, findingId)
    const reg = new (Registry as any)({ hive, key })
    await new Promise<void>((resolve, reject) => {
      reg.remove(valueName, (err: any) => err ? reject(err) : resolve())
    })
    appendActionLog(findingId, findingTitle, 'fix', 'success',
      `Removed registry value: ${valueName}`,
      backupFile ? { type: 'registry', regFile: backupFile } : undefined
    )
    return { success: true }
  } catch (e: any) {
    log.error('fixDeleteRegistryValue', e)
    return { success: false, error: e.message }
  }
}

async function fixDeleteRegistryKey(
  hive: string, key: string,
  findingId: string, findingTitle: string
): Promise<FixResult> {
  try {
    const backupFile = exportRegistryKey(hive, key, findingId)
    execSync(`reg delete "${hive}${key}" /f`, { timeout: 10000 })
    appendActionLog(findingId, findingTitle, 'fix', 'success',
      `Removed registry key: ${key}`,
      backupFile ? { type: 'registry', regFile: backupFile } : undefined
    )
    return { success: true }
  } catch (e: any) {
    log.error('fixDeleteRegistryKey', e)
    return { success: false, error: e.message }
  }
}

// ─── Security fixes ──────────────────────────────────────────────────────────

async function fixDisableGuestAccount(findingId: string, findingTitle: string): Promise<FixResult> {
  try {
    execSync('net user Guest /active:no', { timeout: 10000 })
    appendActionLog(findingId, findingTitle, 'fix', 'success', 'Disabled Guest account')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

async function fixDisableAutorun(findingId: string, findingTitle: string): Promise<FixResult> {
  try {
    const hive = 'HKLM'
    const key = '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
    const backupFile = exportRegistryKey(hive, key, findingId)
    execSync(`reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDriveTypeAutoRun /t REG_DWORD /d 255 /f`, { timeout: 10000 })
    appendActionLog(findingId, findingTitle, 'fix', 'success', 'Disabled AutoRun for all drive types',
      backupFile ? { type: 'registry', regFile: backupFile } : undefined)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ─── Main router ─────────────────────────────────────────────────────────────

export async function applyFix(findingId: string, findingTitle: string): Promise<FixResult> {
  log.info(`applyFix: ${findingId}`)

  const userProfile = process.env.USERPROFILE || 'C:\\Users\\User'

  // Disk fixes
  if (findingId === 'disk-win-temp') {
    return fixDeleteDir('C:\\Windows\\Temp', findingId, findingTitle)
  }
  if (findingId === 'disk-user-temp') {
    return fixDeleteDir(path.join(userProfile, 'AppData\\Local\\Temp'), findingId, findingTitle)
  }
  if (findingId.startsWith('disk-cache-')) {
    // Reconstruct the path from the finding id — in production you'd
    // look up the finding from a persisted scan result
    return { success: false, error: 'Re-scan required before applying cache fix' }
  }

  // Security fixes
  if (findingId === 'sec-guest-enabled') {
    return fixDisableGuestAccount(findingId, findingTitle)
  }
  if (findingId === 'sec-autorun-enabled') {
    return fixDisableAutorun(findingId, findingTitle)
  }

  // Registry fixes
  if (findingId.startsWith('reg-run-missing-')) {
    return { success: false, error: 'Re-scan and select the specific entry to remove.' }
  }
  if (findingId.startsWith('reg-uninstall-')) {
    return { success: false, error: 'Re-scan and select the specific entry to remove.' }
  }

  // App fixes (broken installs — guided only, we don't auto-delete)
  if (findingId.startsWith('app-broken-')) {
    return { success: false, error: 'Use the uninstaller or Windows Settings > Apps to remove.' }
  }

  return { success: false, error: `No fix handler registered for: ${findingId}` }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getDirSize(dirPath: string, depth = 0): number {
  if (depth > 2) return 0
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).reduce((acc, entry) => {
      const full = path.join(dirPath, entry.name)
      try {
        if (entry.isFile()) return acc + fs.statSync(full).size
        if (entry.isDirectory() && !entry.isSymbolicLink()) return acc + getDirSize(full, depth + 1)
      } catch { /* skip */ }
      return acc
    }, 0)
  } catch { return 0 }
}
