import { useEffect } from 'react'
import {
  HardDrive, Package, Rocket, Shield,
  Database, AlertTriangle, Zap
} from 'lucide-react'
import { useStore, allFindings, totalSaved, healthScore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { HealthRing } from '../components/HealthRing'
import { DriveBar } from '../components/DriveBar'
import { SeverityBadge } from '../components/SeverityBadge'
import { severityOrder } from '../components/SeverityBadge'
import type { Module } from '../../shared/types'

const MODULE_META: Record<Module, { label: string; Icon: any; color: string }> = {
  disk:     { label: 'Disk Space',     Icon: HardDrive,     color: '#4f8ef7' },
  apps:     { label: 'App Audit',      Icon: Package,       color: '#a78bfa' },
  startup:  { label: 'Startup & Boot', Icon: Rocket,        color: '#34d399' },
  registry: { label: 'Registry',       Icon: Database,      color: '#f59e0b' },
  security: { label: 'Security',       Icon: Shield,        color: '#f87171' },
  cleanup:  { label: 'Cleanup',        Icon: Zap,           color: '#94a3b8' },
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${b} B`
}

export function Dashboard() {
  const { results, drives, setDrives, setActiveModule } = useStore()
  const { scanAll } = useScan()

  const findings = allFindings(results)
  const saved = totalSaved(results)
  const score = healthScore(results)
  const scanned = Object.values(results).some(r => r !== null)

  useEffect(() => {
    window.api?.getDrives().then(d => setDrives(d)).catch(() => {})
  }, [])

  const criticalFindings = findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    .slice(0, 5)

  const findingsByModule: Partial<Record<Module, number>> = {}
  for (const f of findings) {
    findingsByModule[f.module] = (findingsByModule[f.module] ?? 0) + 1
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Health score */}
        <div className="card flex items-center gap-6">
          <HealthRing score={scanned ? score : 0} size={100} />
          <div>
            <p className="section-header">PC Health</p>
            <p className="stat-value">{scanned ? score : '—'}</p>
            <p className="stat-label">{scanned ? `${findings.length} issues found` : 'Not yet scanned'}</p>
            {!scanned && (
              <button className="btn-primary mt-3 text-xs" onClick={scanAll}>
                <Zap size={13} />
                Run full scan
              </button>
            )}
          </div>
        </div>

        {/* Space recoverable */}
        <div className="card">
          <p className="section-header">Recoverable space</p>
          <p className="stat-value text-success">{scanned ? formatBytes(saved) : '—'}</p>
          <p className="stat-label">Across all modules</p>
          <div className="mt-4 space-y-1">
            {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
              const count = findings.filter(f => f.severity === sev).length
              if (!count) return null
              return (
                <div key={sev} className="flex items-center justify-between">
                  <SeverityBadge severity={sev} />
                  <span className="text-xs text-slate-400">{count} issue{count !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick scan button */}
        <div className="card flex flex-col justify-between">
          <div>
            <p className="section-header">Scan status</p>
            <div className="space-y-2 mt-2">
              {(['disk', 'apps', 'startup', 'security', 'registry'] as Module[]).map(m => {
                const { label, Icon, color } = MODULE_META[m]
                const count = findingsByModule[m] ?? 0
                const status = useStore.getState().status[m]
                return (
                  <div key={m} className="flex items-center gap-2 text-xs">
                    <Icon size={13} style={{ color }} />
                    <span className="text-slate-400 flex-1">{label}</span>
                    {status === 'scanning' && <span className="text-slate-500 scanning">Scanning…</span>}
                    {status === 'done' && <span className="text-slate-400">{count} issue{count !== 1 ? 's' : ''}</span>}
                    {status === 'idle' && <span className="text-slate-600">Not scanned</span>}
                    {status === 'error' && <span className="text-danger">Error</span>}
                  </div>
                )
              })}
            </div>
          </div>
          <button className="btn-primary mt-4 w-full justify-center text-sm" onClick={scanAll}>
            <Zap size={14} />
            {scanned ? 'Re-scan all' : 'Scan all modules'}
          </button>
        </div>
      </div>

      {/* Drives */}
      {drives.length > 0 && (
        <div className="card">
          <p className="section-header">Drive usage</p>
          <div className="space-y-4">
            {drives.map(d => <DriveBar key={d.letter} drive={d} />)}
          </div>
        </div>
      )}

      {/* Critical findings */}
      {criticalFindings.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-header mb-0 flex items-center gap-2">
              <AlertTriangle size={13} className="text-danger" />
              Top issues
            </p>
          </div>
          <div className="space-y-2">
            {criticalFindings.map(f => (
              <div
                key={f.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface hover:bg-surface-tertiary
                           cursor-pointer transition-colors"
                onClick={() => setActiveModule(f.module)}
              >
                <SeverityBadge severity={f.severity} />
                <span className="text-sm text-slate-300 flex-1 truncate">{f.title}</span>
                <span className="text-xs text-slate-500 capitalize">{f.module}</span>
                {f.estimatedBytesSaved && f.estimatedBytesSaved > 0 && (
                  <span className="text-xs text-success">{formatBytes(f.estimatedBytesSaved)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module cards */}
      <div>
        <p className="section-header">Modules</p>
        <div className="grid grid-cols-3 gap-3">
          {(['disk', 'apps', 'startup', 'security', 'registry'] as Module[]).map(m => {
            const { label, Icon, color } = MODULE_META[m]
            const count = findingsByModule[m] ?? 0
            const status = useStore.getState().status[m]
            return (
              <div
                key={m}
                className="card-sm cursor-pointer hover:border-slate-600 transition-colors"
                onClick={() => setActiveModule(m)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} style={{ color }} />
                  <span className="text-sm font-medium text-slate-300">{label}</span>
                </div>
                {status === 'done'
                  ? <p className="text-xs text-slate-500">{count} issue{count !== 1 ? 's' : ''} found</p>
                  : <p className="text-xs text-slate-600">Not scanned</p>
                }
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
