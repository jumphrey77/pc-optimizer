import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import type { Module } from '../../shared/types'

declare global {
  interface Window {
    api: {
      scanDisk: () => Promise<any>
      scanApps: () => Promise<any>
      scanStartup: () => Promise<any>
      scanRegistry: () => Promise<any>
      scanSecurity: () => Promise<any>
      getDrives: () => Promise<any>
      getDiskTree: (path: string) => Promise<any>
      getApps: () => Promise<any>
      getStartup: () => Promise<any>
      getSecurity: () => Promise<any>
      applyFix: (findingId: string) => Promise<any>
      previewFix: (findingId: string) => Promise<any>
      rollbackAction: (logId: string) => Promise<any>
      getRollbackList: () => Promise<any>
      createRestorePoint: (desc: string) => Promise<any>
      getActionLog: () => Promise<any>
      clearActionLog: () => Promise<any>
      openPath: (path: string) => Promise<any>
      openUrl: (url: string) => Promise<any>
    }
  }
}

const SCAN_FNS: Record<Module, () => Promise<any>> = {
  disk:     () => window.api.scanDisk(),
  apps:     () => window.api.scanApps(),
  startup:  () => window.api.scanStartup(),
  registry: () => window.api.scanRegistry(),
  security: () => window.api.scanSecurity(),
  cleanup:  () => Promise.resolve({ module: 'cleanup', startedAt: '', completedAt: '', findings: [], errors: [] }),
}

export function useScan() {
  const { setScanStatus, setScanResult } = useStore()

  const scan = useCallback(async (module: Module) => {
    setScanStatus(module, 'scanning')
    try {
      const result = await SCAN_FNS[module]()
      setScanResult(result)
    } catch (e: any) {
      setScanStatus(module, 'error')
      console.error(`Scan failed: ${module}`, e)
    }
  }, [setScanStatus, setScanResult])

  const scanAll = useCallback(async () => {
    const modules: Module[] = ['disk', 'apps', 'startup', 'security', 'registry']
    // Run sequentially to avoid WMI/registry contention
    for (const m of modules) {
      await scan(m)
    }
  }, [scan])

  return { scan, scanAll }
}
