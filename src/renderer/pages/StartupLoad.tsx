import { useEffect } from 'react'
import { Rocket, ShieldAlert, Shield, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { ScanButton } from '../components/ScanButton'
import { FindingCard } from '../components/FindingCard'
import type { StartupEntry, StartupTrust } from '../../shared/types'

const TRUST_META: Record<StartupTrust, { label: string; Icon: any; color: string }> = {
  microsoft:  { label: 'Microsoft',  Icon: ShieldCheck,    color: '#4f8ef7' },
  verified:   { label: 'Verified',   Icon: Shield,         color: '#22c55e' },
  unknown:    { label: 'Unknown',    Icon: ShieldQuestion, color: '#94a3b8' },
  suspicious: { label: 'Suspicious', Icon: ShieldAlert,    color: '#ef4444' },
}

export function StartupLoad() {
  const { results, startupEntries, setStartupEntries } = useStore()
  const { scan } = useScan()

  const startupResult = results.startup
  const findings = startupResult?.findings ?? []

  useEffect(() => {
    window.api?.getStartup()
      .then(e => setStartupEntries(e ?? []))
      .catch(() => {})
  }, [])

  const byTrust: Record<StartupTrust, StartupEntry[]> = {
    suspicious: [],
    unknown: [],
    verified: [],
    microsoft: [],
  }
  for (const e of startupEntries) {
    byTrust[e.trust].push(e)
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Startup & Boot</h2>
          <p className="text-sm text-slate-500 mt-0.5">Programs that launch when Windows starts</p>
        </div>
        <ScanButton module="startup" onScan={() => scan('startup')} />
      </div>

      {/* Trust breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(TRUST_META) as [StartupTrust, typeof TRUST_META[StartupTrust]][]).map(([trust, meta]) => (
          <div key={trust} className="card-sm">
            <div className="flex items-center gap-2 mb-2">
              <meta.Icon size={14} style={{ color: meta.color }} />
              <span className="text-xs text-slate-500">{meta.label}</span>
            </div>
            <p className="stat-value" style={{ color: meta.color }}>
              {byTrust[trust].length}
            </p>
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

      {/* Entry list by trust group */}
      {(['suspicious', 'unknown', 'verified', 'microsoft'] as StartupTrust[]).map(trust => {
        const entries = byTrust[trust]
        if (entries.length === 0) return null
        const { label, Icon, color } = TRUST_META[trust]
        return (
          <div key={trust}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={13} style={{ color }} />
              <p className="section-header mb-0">{label} ({entries.length})</p>
            </div>
            <div className="space-y-1">
              {entries.map(e => <StartupRow key={e.id} entry={e} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StartupRow({ entry }: { entry: StartupEntry }) {
  const { Icon, color } = TRUST_META[entry.trust]
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg
      ${!entry.pathExists ? 'opacity-50' : ''}
      hover:bg-surface-secondary transition-colors`}
    >
      <Icon size={13} style={{ color }} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">{entry.name}</span>
          {!entry.pathExists && (
            <span className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-xs">
              missing file
            </span>
          )}
        </div>
        <code className="text-xs text-slate-600 font-mono truncate block mt-0.5">
          {entry.command}
        </code>
        <p className="text-xs text-slate-600 mt-0.5">{entry.location}</p>
      </div>
      <span className={`badge text-xs ${
        entry.impact === 'high'   ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
        entry.impact === 'medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
        'bg-slate-700/50 text-slate-500 border border-slate-700'
      }`}>
        {entry.impact}
      </span>
    </div>
  )
}
