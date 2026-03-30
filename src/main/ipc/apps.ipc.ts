import { ipcMain } from 'electron'
import { IPC } from '../../shared/types'
import { getInstalledApps, scanApps } from '../scanners/apps.scanner'
import { getStartupEntries, scanStartup } from '../scanners/startup.scanner'
import { scanRegistry } from '../scanners/registry.scanner'
import { getSecurityStatus, scanSecurity } from '../scanners/security.scanner'
import {
  createRestorePoint, readActionLog, appendActionLog,
  clearActionLog, getRollbackList, importRegistryFile
} from '../rollback/rollback.engine'
import { applyFix } from '../fixers/fix.engine'

export function registerAppsIpc(): void {
  ipcMain.handle(IPC.GET_APPS,  () => getInstalledApps())
  ipcMain.handle(IPC.SCAN_APPS, () => scanApps())
}

export function registerStartupIpc(): void {
  ipcMain.handle(IPC.GET_STARTUP,  () => getStartupEntries())
  ipcMain.handle(IPC.SCAN_STARTUP, () => scanStartup())
}

export function registerRegistryIpc(): void {
  ipcMain.handle(IPC.SCAN_REGISTRY, () => scanRegistry())
}

export function registerSecurityIpc(): void {
  ipcMain.handle(IPC.GET_SECURITY,  () => getSecurityStatus())
  ipcMain.handle(IPC.SCAN_SECURITY, () => scanSecurity())
}

export function registerRollbackIpc(): void {
  ipcMain.handle(IPC.RESTORE_POINT,   (_, desc: string) => createRestorePoint(desc))
  ipcMain.handle(IPC.ACTION_LOG_GET,  () => readActionLog())
  ipcMain.handle(IPC.ACTION_LOG_CLEAR, () => clearActionLog())
  ipcMain.handle(IPC.ROLLBACK_LIST,   () => getRollbackList())

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
      return { success: false, error: 'Registry import failed' }
    }
    return { success: false, error: 'Unknown rollback type' }
  })

  ipcMain.handle(IPC.FIX_APPLY, (_, findingId: string, findingTitle?: string) => {
    return applyFix(findingId, findingTitle ?? findingId)
  })

  ipcMain.handle(IPC.FIX_PREVIEW, (_, findingId: string) => {
    return { findingId, preview: 'Fix preview not yet implemented for this finding type.' }
  })
}
