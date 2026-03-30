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
log.info('PC Optimizer starting')

const DEV_URL = 'http://localhost:5173'
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

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
    show: false,
    webPreferences: {
      // In dev: __dirname is dist/main, preload is dist/main/preload/index.js
      // In prod: same relative path applies
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
  ipcMain.handle(IPC.OPEN_PATH, (_, p: string) => shell.openPath(p))
  ipcMain.handle(IPC.OPEN_URL,  (_, u: string) => shell.openExternal(u))

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Packaged: renderer files are in resources/renderer/
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
