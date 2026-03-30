import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { registerDiskIpc } from './ipc/disk.ipc'
import { registerAppsIpc } from './ipc/apps.ipc'
import { registerStartupIpc } from './ipc/startup.ipc'
import { registerRegistryIpc } from './ipc/registry.ipc'
import { registerSecurityIpc } from './ipc/security.ipc'
import { registerRollbackIpc } from './ipc/rollback.ipc'
import { IPC } from '../shared/types'

log.initialize()

const DEV_URL = 'http://localhost:5173'
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f1117',
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.removeMenu()

  registerDiskIpc()
  registerAppsIpc()
  registerStartupIpc()
  registerRegistryIpc()
  registerSecurityIpc()
  registerRollbackIpc()

  ipcMain.handle(IPC.OPEN_PATH, (_, p: string) => shell.openPath(p))
  ipcMain.handle(IPC.OPEN_URL,  (_, u: string) => shell.openExternal(u))

  ipcMain.handle('win:minimize', () => mainWindow?.minimize())
  ipcMain.handle('win:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('win:close', () => mainWindow?.close())

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(join(process.resourcesPath, 'renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
