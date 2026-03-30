// ─── Module & severity enums ────────────────────────────────────────────────

export type Module =
  | 'disk'
  | 'registry'
  | 'apps'
  | 'startup'
  | 'security'
  | 'cleanup'

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type FixType =
  | 'automatic'   // one-click, handled in main process
  | 'guided'      // wizard walks user through it
  | 'manual'      // opens settings or provides instructions
  | 'none'        // informational only

// ─── Core finding model ──────────────────────────────────────────────────────

export interface Finding {
  id: string
  module: Module
  severity: Severity
  title: string
  description: string
  evidence: string[]           // raw paths, key names, values shown to user
  estimatedBytesSaved?: number
  fixType: FixType
  requiresElevation: boolean
  rollbackSupported: boolean
  rollbackPlan?: string        // plain-English description of what undo does
  helpUrl?: string
}

// ─── Scan results ────────────────────────────────────────────────────────────

export interface ScanResult {
  module: Module
  startedAt: string            // ISO string (serialisable over IPC)
  completedAt: string
  findings: Finding[]
  errors: string[]
}

// ─── Action log (append-only change journal) ─────────────────────────────────

export type ActionOutcome = 'success' | 'failed' | 'partial'
export type ActionType = 'fix' | 'skip' | 'rollback'

export interface ActionLog {
  id: string
  timestamp: string
  findingId: string
  findingTitle: string
  action: ActionType
  outcome: ActionOutcome
  detail: string
}

// ─── Disk types ──────────────────────────────────────────────────────────────

export interface DriveInfo {
  letter: string
  label: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
}

export interface DiskNode {
  name: string
  path: string
  size: number                 // bytes
  category: DiskCategory
  children?: DiskNode[]
}

export type DiskCategory =
  | 'system'
  | 'user'
  | 'games'
  | 'cache'
  | 'dev'
  | 'media'
  | 'other'

// ─── App types ───────────────────────────────────────────────────────────────

export interface InstalledApp {
  id: string
  name: string
  publisher?: string
  version?: string
  installDate?: string
  installLocation?: string
  estimatedSize?: number       // bytes
  uninstallString?: string
  isBloatware: boolean
  isBrokenInstall: boolean
  runtimeType?: 'dotnet' | 'vcredist' | 'java' | null
  startupImpact?: 'none' | 'low' | 'medium' | 'high'
}

// ─── Startup types ───────────────────────────────────────────────────────────

export type StartupTrust = 'microsoft' | 'verified' | 'unknown' | 'suspicious'

export interface StartupEntry {
  id: string
  name: string
  command: string
  location: string             // registry key path or folder path
  trust: StartupTrust
  enabled: boolean
  pathExists: boolean
  impact: 'low' | 'medium' | 'high'
}

// ─── Security types ──────────────────────────────────────────────────────────

export interface SecurityStatus {
  defenderEnabled: boolean
  defenderLastScan?: string
  firewallEnabled: boolean
  uacEnabled: boolean
  windowsUpdatePending: number
  guestAccountEnabled: boolean
  autorunEnabled: boolean
}

// ─── IPC channel map ─────────────────────────────────────────────────────────
// Keep this as single source of truth — import in both main and renderer

export const IPC = {
  SCAN_DISK:          'scan:disk',
  SCAN_APPS:          'scan:apps',
  SCAN_STARTUP:       'scan:startup',
  SCAN_REGISTRY:      'scan:registry',
  SCAN_SECURITY:      'scan:security',

  GET_DRIVES:         'get:drives',
  GET_DISK_TREE:      'get:disk-tree',
  GET_APPS:           'get:apps',
  GET_STARTUP:        'get:startup',
  GET_SECURITY:       'get:security',

  FIX_APPLY:          'fix:apply',
  FIX_PREVIEW:        'fix:preview',

  ROLLBACK_ACTION:    'rollback:action',
  ROLLBACK_LIST:      'rollback:list',
  RESTORE_POINT:      'restore:create',

  ACTION_LOG_GET:     'actionlog:get',
  ACTION_LOG_CLEAR:   'actionlog:clear',

  OPEN_PATH:          'shell:open-path',
  OPEN_URL:           'shell:open-url',
} as const
