import { ipcMain } from 'electron'
import { IPC } from '../../shared/types'
import { getInstalledApps, scanApps } from '../scanners/apps.scanner'
import { getStartupEntries, scanStartup } from '../scanners/startup.scanner'
import { scanRegistry } from '../scanners/registry.scanner'
import { getSecurityStatus, scanSecurity } from '../scanners/security.scanner'
import {
  createRestorePoint, readActionLog,
  clearActionLog, getRollbackList, importRegistryFile
} from '../rollback/rollback.engine'
import { appendActionLog } from '../rollback/rollback.engine'
import { applyFix } from '../fixers/fix.engine'

/**
 * Wrap any async fn so it runs after current event loop tick.
 * Prevents "Not Responding" on long-running scans.
 */
function deferred<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => fn().then(resolve).catch(reject))
  })
}

export function registerAppsIpc(): void {
  ipcMain.handle(IPC.GET_APPS,  () => deferred(() => getInstalledApps()))
  ipcMain.handle(IPC.SCAN_APPS, () => deferred(() => scanApps()))
}

export function registerStartupIpc(): void {
  ipcMain.handle(IPC.GET_STARTUP,  () => deferred(() => getStartupEntries()))
  ipcMain.handle(IPC.SCAN_STARTUP, () => deferred(() => scanStartup()))
}

export function registerRegistryIpc(): void {
  ipcMain.handle(IPC.SCAN_REGISTRY, () => deferred(() => scanRegistry()))
}

export function registerSecurityIpc(): void {
  ipcMain.handle(IPC.GET_SECURITY,  () => deferred(() => getSecurityStatus()))
  ipcMain.handle(IPC.SCAN_SECURITY, () => deferred(() => scanSecurity()))
}

export function registerRollbackIpc(): void {
  ipcMain.handle(IPC.RESTORE_POINT,    (_, desc: string) => deferred(() => Promise.resolve(createRestorePoint(desc))))
  ipcMain.handle(IPC.ACTION_LOG_GET,   () => Promise.resolve(readActionLog()))
  ipcMain.handle(IPC.ACTION_LOG_CLEAR, () => Promise.resolve(clearActionLog()))
  ipcMain.handle(IPC.ROLLBACK_LIST,    () => Promise.resolve(getRollbackList()))

  ipcMain.handle(IPC.ROLLBACK_ACTION, (_, logId: string) => {
    const list = getRollbackList() as any[]
    const entry = list.find((e: any) => e.id === logId)
    if (!entry?.rollbackData) return { success: false, error: 'No rollback data found' }
    const { type, regFile } = entry.rollbackData
    if (type === 'registry' && regFile) {
      const ok = importRegistryFile(regFile)
      if (ok) {
        appendActionLog(entry.findingId, entry.findingTitle, 'rollback', 'success', `Rolled back from ${regFile}`)
        return { success: true }
      }
    }
    return { success: false, error: 'Rollback failed' }
  })

  ipcMain.handle(IPC.FIX_APPLY, (_, findingId: string, findingTitle?: string) =>
    deferred(() => applyFix(findingId, findingTitle ?? findingId))
  )

  ipcMain.handle(IPC.FIX_PREVIEW, (_, findingId: string) =>
    Promise.resolve({ findingId, preview: 'Preview not yet available.' })
  )
}
