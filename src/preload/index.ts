import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

// Expose a typed API to the renderer - never expose raw ipcRenderer
contextBridge.exposeInMainWorld('api', {
  // Scans
  scanDisk:     ()                   => ipcRenderer.invoke(IPC.SCAN_DISK),
  scanApps:     ()                   => ipcRenderer.invoke(IPC.SCAN_APPS),
  scanStartup:  ()                   => ipcRenderer.invoke(IPC.SCAN_STARTUP),
  scanRegistry: ()                   => ipcRenderer.invoke(IPC.SCAN_REGISTRY),
  scanSecurity: ()                   => ipcRenderer.invoke(IPC.SCAN_SECURITY),

  // Data fetches
  getDrives:    ()                   => ipcRenderer.invoke(IPC.GET_DRIVES),
  getDiskTree:  (path: string)       => ipcRenderer.invoke(IPC.GET_DISK_TREE, path),
  getApps:      ()                   => ipcRenderer.invoke(IPC.GET_APPS),
  getStartup:   ()                   => ipcRenderer.invoke(IPC.GET_STARTUP),
  getSecurity:  ()                   => ipcRenderer.invoke(IPC.GET_SECURITY),

  // Fixes
  applyFix:     (findingId: string)  => ipcRenderer.invoke(IPC.FIX_APPLY, findingId),
  previewFix:   (findingId: string)  => ipcRenderer.invoke(IPC.FIX_PREVIEW, findingId),

  // Rollback
  rollbackAction: (logId: string)    => ipcRenderer.invoke(IPC.ROLLBACK_ACTION, logId),
  getRollbackList: ()                => ipcRenderer.invoke(IPC.ROLLBACK_LIST),
  createRestorePoint: (desc: string) => ipcRenderer.invoke(IPC.RESTORE_POINT, desc),

  // Action log
  getActionLog: ()                   => ipcRenderer.invoke(IPC.ACTION_LOG_GET),
  clearActionLog: ()                 => ipcRenderer.invoke(IPC.ACTION_LOG_CLEAR),

  // Shell
  openPath: (path: string)           => ipcRenderer.invoke(IPC.OPEN_PATH, path),
  openUrl:  (url: string)            => ipcRenderer.invoke(IPC.OPEN_URL, url),
})
