import { Database, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { ScanButton } from '../components/ScanButton'
import { FindingCard } from '../components/FindingCard'

export function RegistryHealth() {
  const { results } = useStore()
  const { scan } = useScan()

  const regResult = results.registry
  const findings = regResult?.findings ?? []

  const byCategory = {
    run: findings.filter(f => f.id.startsWith('reg-run')),
    uninstall: findings.filter(f => f.id.startsWith('reg-uninstall')),
    associations: findings.filter(f => f.id.startsWith('reg-broken-assoc')),
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Registry Health</h2>
          <p className="text-sm text-slate-500 mt-0.5">Conservative checks — broken references and orphaned entries only</p>
        </div>
        <ScanButton module="registry" onScan={() => scan('registry')} />
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-300">Conservative scanning mode</p>
          <p className="text-xs text-slate-500 mt-1">
            This scanner only flags broken references, missing paths, and orphaned entries.
            It does not perform broad "registry cleaning" that can cause harm.
            All fixes are backed up as .reg files before any change is applied.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Run key issues', count: byCategory.run.length, color: '#f59e0b' },
          { label: 'Broken uninstallers', count: byCategory.uninstall.length, color: '#ef4444' },
          { label: 'File assoc. issues', count: byCategory.associations.length, color: '#4f8ef7' },
        ].map(({ label, count, color }) => (
          <div key={label} className="card-sm">
            <p className="stat-value" style={{ color }}>{regResult ? count : '—'}</p>
            <p className="stat-label">{label}</p>
          </div>
        ))}
      </div>

      {/* Findings */}
      <div>
        <p className="section-header">
          Findings {findings.length > 0 && `(${findings.length})`}
        </p>
        {findings.length === 0 ? (
          <div className="card text-center py-10 text-slate-600 text-sm">
            {regResult
              ? '✓ No registry issues found'
              : 'Run a scan to check registry health'}
          </div>
        ) : (
          <div className="space-y-2">
            {findings.map(f => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
