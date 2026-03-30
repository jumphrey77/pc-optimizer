import { useEffect, useState } from 'react'
import { Search, Package, AlertCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { ScanButton } from '../components/ScanButton'
import { FindingCard } from '../components/FindingCard'
import type { InstalledApp } from '../../shared/types'

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${b} B`
}

export function AppAudit() {
  const { results, apps, setApps } = useStore()
  const { scan } = useScan()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'bloatware' | 'broken' | 'runtimes'>('all')
  const [loading, setLoading] = useState(false)

  const appResult = results.apps
  const findings = appResult?.findings ?? []

  useEffect(() => {
    loadApps()
  }, [])

  async function loadApps() {
    setLoading(true)
    try {
      const data = await window.api?.getApps()
      setApps(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const filtered = apps.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'all' ? true :
      filter === 'bloatware' ? a.isBloatware :
      filter === 'broken' ? a.isBrokenInstall :
      filter === 'runtimes' ? !!a.runtimeType :
      true
    return matchSearch && matchFilter
  })

  const bloatCount = apps.filter(a => a.isBloatware).length
  const brokenCount = apps.filter(a => a.isBrokenInstall).length
  const runtimeCount = apps.filter(a => a.runtimeType).length

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">App Audit</h2>
          <p className="text-sm text-slate-500 mt-0.5">Installed apps, bloatware, and broken entries</p>
        </div>
        <ScanButton module="apps" onScan={() => scan('apps')} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total apps', value: apps.length, color: '#4f8ef7' },
          { label: 'Bloatware', value: bloatCount, color: '#f59e0b' },
          { label: 'Broken installs', value: brokenCount, color: '#ef4444' },
          { label: 'Runtimes', value: runtimeCount, color: '#a78bfa' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-sm">
            <p className="stat-value" style={{ color }}>{loading ? '…' : value}</p>
            <p className="stat-label">{label}</p>
          </div>
        ))}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <p className="section-header">Issues ({findings.length})</p>
          <div className="space-y-2">
            {findings.map(f => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {/* App list */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="section-header mb-0">Installed apps</p>
          <div className="flex-1" />
          {/* Filter tabs */}
          <div className="flex bg-surface rounded-lg p-0.5 gap-0.5">
            {(['all', 'bloatware', 'broken', 'runtimes'] as const).map(f => (
              <button
                key={f}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize ${
                  filter === f
                    ? 'bg-surface-tertiary text-slate-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-surface border border-surface-border rounded-lg pl-7 pr-3 py-1.5
                         text-xs text-slate-300 placeholder-slate-600
                         focus:outline-none focus:border-brand/50 w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-600 text-sm">Loading apps…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-600 text-sm">No apps match filter</div>
        ) : (
          <div className="space-y-1">
            {filtered.map(app => (
              <AppRow key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AppRow({ app }: { app: InstalledApp }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-secondary
                    transition-colors group">
      <Package size={14} className="text-slate-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300 truncate">{app.name}</span>
          {app.isBloatware && (
            <span className="badge bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">bloatware</span>
          )}
          {app.isBrokenInstall && (
            <span className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-xs flex items-center gap-1">
              <AlertCircle size={10} /> broken
            </span>
          )}
          {app.runtimeType && (
            <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs">
              {app.runtimeType}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600 truncate">{app.publisher || 'Unknown publisher'}</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
        {app.estimatedSize && app.estimatedSize > 0 && (
          <span>{formatBytes(app.estimatedSize)}</span>
        )}
        {app.version && <span className="text-slate-600">{app.version}</span>}
      </div>
    </div>
  )
}
