import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { app } from 'electron'
import log from 'electron-log'
import type { ActionLog, ActionType, ActionOutcome } from '../../shared/types'

const DATA_DIR = path.join(app.getPath('userData'), 'rollback')
const ACTION_LOG_FILE = path.join(app.getPath('userData'), 'action-log.json')
const REG_BACKUP_DIR = path.join(DATA_DIR, 'registry')

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(REG_BACKUP_DIR)) fs.mkdirSync(REG_BACKUP_DIR, { recursive: true })
}

export function createRestorePoint(description: string): boolean {
  try {
    const ps = `Checkpoint-Computer -Description "${description}" -RestorePointType "MODIFY_SETTINGS"`
    execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 30000 })
    log.info(`Restore point created: ${description}`)
    return true
  } catch (e) {
    log.warn('createRestorePoint failed (may need elevation or be rate-limited)', e)
    return false
  }
}

export function exportRegistryKey(hive: string, keyPath: string, backupName: string): string | null {
  try {
    ensureDirs()
    const safeName = backupName.replace(/[^a-z0-9-]/gi, '_')
    const timestamp = Date.now()
    const filePath = path.join(REG_BACKUP_DIR, `${safeName}_${timestamp}.reg`)
    const fullKey = `${hive}${keyPath}`
    execSync(`reg export "${fullKey}" "${filePath}" /y`, { timeout: 10000 })
    log.info(`Registry backup: ${filePath}`)
    return filePath
  } catch (e) {
    log.error('exportRegistryKey failed', e)
    return null
  }
}

export function importRegistryFile(filePath: string): boolean {
  try {
    execSync(`reg import "${filePath}"`, { timeout: 10000 })
    log.info(`Registry restored from: ${filePath}`)
    return true
  } catch (e) {
    log.error('importRegistryFile failed', e)
    return false
  }
}

// ─── Action log ──────────────────────────────────────────────────────────────

export function readActionLog(): ActionLog[] {
  try {
    if (!fs.existsSync(ACTION_LOG_FILE)) return []
    return JSON.parse(fs.readFileSync(ACTION_LOG_FILE, 'utf-8'))
  } catch {
    return []
  }
}

export function appendActionLog(
  findingId: string,
  findingTitle: string,
  action: ActionType,
  outcome: ActionOutcome,
  detail: string,
  rollbackData?: Record<string, string>
): ActionLog {
  const log_entry: ActionLog & { rollbackData?: Record<string, string> } = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    findingId,
    findingTitle,
    action,
    outcome,
    detail,
    ...(rollbackData ? { rollbackData } : {})
  }

  const existing = readActionLog()
  existing.unshift(log_entry)

  try {
    fs.writeFileSync(ACTION_LOG_FILE, JSON.stringify(existing.slice(0, 200), null, 2))
  } catch (e) {
    log.error('appendActionLog write failed', e)
  }

  return log_entry
}

export function clearActionLog(): void {
  try {
    fs.writeFileSync(ACTION_LOG_FILE, '[]')
  } catch { /* ok */ }
}

export function getRollbackList(): Array<ActionLog & { rollbackData?: Record<string, string> }> {
  try {
    if (!fs.existsSync(ACTION_LOG_FILE)) return []
    const all = JSON.parse(fs.readFileSync(ACTION_LOG_FILE, 'utf-8'))
    return all.filter((e: any) => e.action === 'fix' && e.outcome === 'success' && e.rollbackData)
  } catch {
    return []
  }
}
