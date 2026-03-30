import { ipcMain } from 'electron'
import { IPC } from '../../shared/types'
import { getDrives, getDiskTree, scanDisk } from '../scanners/disk.scanner'

export function registerDiskIpc(): void {
  ipcMain.handle(IPC.GET_DRIVES,    () => getDrives())
  ipcMain.handle(IPC.GET_DISK_TREE, (_, p: string) => getDiskTree(p))
  ipcMain.handle(IPC.SCAN_DISK,     () => scanDisk())
}
