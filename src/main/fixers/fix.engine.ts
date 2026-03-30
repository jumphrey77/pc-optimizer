import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import log from 'electron-log'
import { deleteValue, deleteKey, exportKey } from '../utils/registry.helper'
import { appendActionLog } from '../rollback/rollback.engine'

interface FixResult {
  success: boolean
  error?: string
  bytesSaved?: number
}

// ─── Disk fixes ──────────────────────────────────────────────────────────────

function clearDirectory(dirPath: string, findingId: string, findingTitle: string): FixResult {
  try {
    if (!fs.existsSync(dirPath)) return { success: false, error: 'Path no longer exists' }
    const sizeBefore = getDirSize(dirPath)
    const entries = fs.readdirSync(dirPath)
    let deleted = 0
    for (const entry of entries) {
      try { fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true }); deleted++ }
      catch { /* skip locked files */ }
    }
    appendActionLog(findingId, findingTitle, 'fix', 'success', `Cleared ${deleted} items from ${dirPath}`)
    return { success: true, bytesSaved: sizeBefore }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ─── Registry fixes ──────────────────────────────────────────────────────────

function fixRegistryKey(keyPath: string, valueName: string | null, findingId: string, findingTitle: string): FixResult {
  try {
    const backupFile = path.join(
      process.env.APPDATA || 'C:\\Users\\User\\AppData\\Roaming',
      `pc-optimizer\\rollback\\${findingId.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.reg`
    )
    fs.mkdirSync(path.dirname(backupFile), { recursive: true })
    exportKey(keyPath, backupFile)

    const ok = valueName ? deleteValue(keyPath, valueName) : deleteKey(keyPath)
    if (!ok) return { success: false, error: 'Registry operation failed' }

    appendActionLog(findingId, findingTitle, 'fix', 'success',
      valueName ? `Removed value: ${valueName}` : `Removed key: ${keyPath}`,
      { type: 'registry', regFile: backupFile }
    )
    return { success: true }
  } catch (e: any) {
    log.error('fixRegistryKey', e)
    return { success: false, error: e.message }
  }
}

// ─── Security fixes ──────────────────────────────────────────────────────────

function fixDisableGuestAccount(findingId: string, findingTitle: string): FixResult {
  try {
    execFileSync('net.exe', ['user', 'Guest', '/active:no'], { timeout: 10000 })
    appendActionLog(findingId, findingTitle, 'fix', 'success', 'Disabled Guest account')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

function fixDisableAutorun(findingId: string, findingTitle: string): FixResult {
  try {
    const keyPath = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
    const backupFile = path.join(
      process.env.APPDATA || '', `pc-optimizer\\rollback\\autorun_${Date.now()}.reg`
    )
    fs.mkdirSync(path.dirname(backupFile), { recursive: true })
    exportKey(keyPath, backupFile)
    execFileSync('reg.exe', [
      'add', keyPath, '/v', 'NoDriveTypeAutoRun', '/t', 'REG_DWORD', '/d', '255', '/f'
    ], { timeout: 10000 })
    appendActionLog(findingId, findingTitle, 'fix', 'success',
      'Disabled AutoRun for all drive types', { type: 'registry', regFile: backupFile })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ─── Main router ─────────────────────────────────────────────────────────────

export async function applyFix(findingId: string, findingTitle: string): Promise<FixResult> {
  log.info(`applyFix: ${findingId}`)
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\User'

  if (findingId === 'disk-win-temp')
    return clearDirectory('C:\\Windows\\Temp', findingId, findingTitle)

  if (findingId === 'disk-user-temp')
    return clearDirectory(path.join(userProfile, 'AppData\\Local\\Temp'), findingId, findingTitle)

  if (findingId === 'sec-guest-enabled')
    return fixDisableGuestAccount(findingId, findingTitle)

  if (findingId === 'sec-autorun-enabled')
    return fixDisableAutorun(findingId, findingTitle)

  if (findingId.startsWith('reg-run-missing-'))
    return { success: false, error: 'Re-scan to identify exact registry key before removing.' }

  if (findingId.startsWith('reg-uninstall-'))
    return { success: false, error: 'Re-scan to identify exact registry key before removing.' }

  return { success: false, error: `No fix handler registered for: ${findingId}` }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDirSize(dir: string, depth = 0): number {
  if (depth > 2) return 0
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
      const full = path.join(dir, e.name)
      try {
        if (e.isFile()) return acc + fs.statSync(full).size
        if (e.isDirectory() && !e.isSymbolicLink()) return acc + getDirSize(full, depth + 1)
      } catch { /* skip */ }
      return acc
    }, 0)
  } catch { return 0 }
}
