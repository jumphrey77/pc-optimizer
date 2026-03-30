import { ipcMain } from 'electron'
import { IPC } from '../../shared/types'
import { getDrives, getDiskTree, scanDisk } from '../scanners/disk.scanner'

function deferred<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => fn().then(resolve).catch(reject))
  })
}

export function registerDiskIpc(): void {
  ipcMain.handle(IPC.GET_DRIVES,    () => deferred(() => getDrives()))
  ipcMain.handle(IPC.GET_DISK_TREE, (_, p: string) => deferred(() => getDiskTree(p)))
  ipcMain.handle(IPC.SCAN_DISK,     () => deferred(() => scanDisk()))
}
