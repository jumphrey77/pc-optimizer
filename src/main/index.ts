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
log.info('PC Optimizer starting up')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f1117',
      symbolColor: '#94a3b8',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Register all IPC handlers
  registerDiskIpc()
  registerAppsIpc()
  registerStartupIpc()
  registerRegistryIpc()
  registerSecurityIpc()
  registerRollbackIpc()

  // Shell helpers
  ipcMain.handle(IPC.OPEN_PATH, (_, path: string) => shell.openPath(path))
  ipcMain.handle(IPC.OPEN_URL, (_, url: string) => shell.openExternal(url))

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
