import { create } from 'zustand'
import type {
  ScanResult, DriveInfo, InstalledApp,
  StartupEntry, SecurityStatus, ActionLog, Module
} from '../../shared/types'

type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

interface ScanState {
  status: Record<Module, ScanStatus>
  results: Record<Module, ScanResult | null>
  lastScanned: Record<Module, string | null>

  // Raw data
  drives: DriveInfo[]
  apps: InstalledApp[]
  startupEntries: StartupEntry[]
  securityStatus: SecurityStatus | null
  actionLog: ActionLog[]

  // UI
  activeModule: Module | 'dashboard' | 'safety'
  selectedFindingId: string | null

  // Actions
  setActiveModule: (m: ScanState['activeModule']) => void
  setSelectedFinding: (id: string | null) => void
  setScanStatus: (module: Module, status: ScanStatus) => void
  setScanResult: (result: ScanResult) => void
  setDrives: (drives: DriveInfo[]) => void
  setApps: (apps: InstalledApp[]) => void
  setStartupEntries: (entries: StartupEntry[]) => void
  setSecurityStatus: (s: SecurityStatus) => void
  setActionLog: (log: ActionLog[]) => void
  prependActionLog: (entry: ActionLog) => void
}

const MODULES: Module[] = ['disk', 'apps', 'startup', 'registry', 'security']

const initStatus = () =>
  Object.fromEntries(MODULES.map(m => [m, 'idle'])) as Record<Module, ScanStatus>

const initResults = () =>
  Object.fromEntries(MODULES.map(m => [m, null])) as Record<Module, ScanResult | null>

const initDates = () =>
  Object.fromEntries(MODULES.map(m => [m, null])) as Record<Module, string | null>

export const useStore = create<ScanState>((set) => ({
  status: initStatus(),
  results: initResults(),
  lastScanned: initDates(),
  drives: [],
  apps: [],
  startupEntries: [],
  securityStatus: null,
  actionLog: [],
  activeModule: 'dashboard',
  selectedFindingId: null,

  setActiveModule: (m) => set({ activeModule: m, selectedFindingId: null }),
  setSelectedFinding: (id) => set({ selectedFindingId: id }),

  setScanStatus: (module, status) =>
    set(s => ({ status: { ...s.status, [module]: status } })),

  setScanResult: (result) =>
    set(s => ({
      results: { ...s.results, [result.module]: result },
      lastScanned: { ...s.lastScanned, [result.module]: result.completedAt },
      status: { ...s.status, [result.module]: result.errors.length ? 'error' : 'done' }
    })),

  setDrives: (drives) => set({ drives }),
  setApps: (apps) => set({ apps }),
  setStartupEntries: (startupEntries) => set({ startupEntries }),
  setSecurityStatus: (securityStatus) => set({ securityStatus }),
  setActionLog: (actionLog) => set({ actionLog }),
  prependActionLog: (entry) =>
    set(s => ({ actionLog: [entry, ...s.actionLog].slice(0, 200) })),
}))

// ─── Selectors ───────────────────────────────────────────────────────────────

export function allFindings(results: Record<Module, ScanResult | null>) {
  return MODULES.flatMap(m => results[m]?.findings ?? [])
}

export function totalSaved(results: Record<Module, ScanResult | null>) {
  return allFindings(results).reduce((acc, f) => acc + (f.estimatedBytesSaved ?? 0), 0)
}

export function healthScore(results: Record<Module, ScanResult | null>): number {
  const findings = allFindings(results)
  if (findings.length === 0) return 100
  const weights = { critical: 20, high: 10, medium: 4, low: 1, info: 0 }
  const penalty = findings.reduce((acc, f) => acc + (weights[f.severity] ?? 0), 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}
