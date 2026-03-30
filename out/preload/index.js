"use strict";
const electron = require("electron");
const IPC = {
  SCAN_DISK: "scan:disk",
  SCAN_APPS: "scan:apps",
  SCAN_STARTUP: "scan:startup",
  SCAN_REGISTRY: "scan:registry",
  SCAN_SECURITY: "scan:security",
  GET_DRIVES: "get:drives",
  GET_DISK_TREE: "get:disk-tree",
  GET_APPS: "get:apps",
  GET_STARTUP: "get:startup",
  GET_SECURITY: "get:security",
  FIX_APPLY: "fix:apply",
  FIX_PREVIEW: "fix:preview",
  ROLLBACK_ACTION: "rollback:action",
  ROLLBACK_LIST: "rollback:list",
  RESTORE_POINT: "restore:create",
  ACTION_LOG_GET: "actionlog:get",
  ACTION_LOG_CLEAR: "actionlog:clear",
  OPEN_PATH: "shell:open-path",
  OPEN_URL: "shell:open-url"
};
electron.contextBridge.exposeInMainWorld("api", {
  // Scans
  scanDisk: () => electron.ipcRenderer.invoke(IPC.SCAN_DISK),
  scanApps: () => electron.ipcRenderer.invoke(IPC.SCAN_APPS),
  scanStartup: () => electron.ipcRenderer.invoke(IPC.SCAN_STARTUP),
  scanRegistry: () => electron.ipcRenderer.invoke(IPC.SCAN_REGISTRY),
  scanSecurity: () => electron.ipcRenderer.invoke(IPC.SCAN_SECURITY),
  // Data fetches
  getDrives: () => electron.ipcRenderer.invoke(IPC.GET_DRIVES),
  getDiskTree: (path) => electron.ipcRenderer.invoke(IPC.GET_DISK_TREE, path),
  getApps: () => electron.ipcRenderer.invoke(IPC.GET_APPS),
  getStartup: () => electron.ipcRenderer.invoke(IPC.GET_STARTUP),
  getSecurity: () => electron.ipcRenderer.invoke(IPC.GET_SECURITY),
  // Fixes
  applyFix: (findingId) => electron.ipcRenderer.invoke(IPC.FIX_APPLY, findingId),
  previewFix: (findingId) => electron.ipcRenderer.invoke(IPC.FIX_PREVIEW, findingId),
  // Rollback
  rollbackAction: (logId) => electron.ipcRenderer.invoke(IPC.ROLLBACK_ACTION, logId),
  getRollbackList: () => electron.ipcRenderer.invoke(IPC.ROLLBACK_LIST),
  createRestorePoint: (desc) => electron.ipcRenderer.invoke(IPC.RESTORE_POINT, desc),
  // Action log
  getActionLog: () => electron.ipcRenderer.invoke(IPC.ACTION_LOG_GET),
  clearActionLog: () => electron.ipcRenderer.invoke(IPC.ACTION_LOG_CLEAR),
  // Shell
  openPath: (path) => electron.ipcRenderer.invoke(IPC.OPEN_PATH, path),
  openUrl: (url) => electron.ipcRenderer.invoke(IPC.OPEN_URL, url)
});
