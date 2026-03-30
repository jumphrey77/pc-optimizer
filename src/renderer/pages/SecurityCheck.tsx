import { useEffect } from 'react'
import { Shield, ShieldCheck, ShieldAlert, ShieldX, RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { ScanButton } from '../components/ScanButton'
import { FindingCard } from '../components/FindingCard'
import type { SecurityStatus } from '../../shared/types'

interface StatusRowProps {
  label: string
  ok: boolean
  value?: string
  detail?: string
}

function StatusRow({ label, ok, value, detail }: StatusRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface-border last:border-0">
      {ok
        ? <ShieldCheck size={15} className="text-success shrink-0" />
        : <ShieldAlert size={15} className="text-danger shrink-0" />
      }
      <span className="text-sm text-slate-300 flex-1">{label}</span>
      {value && <span className="text-xs text-slate-500">{value}</span>}
      <span className={`badge border text-xs ${
        ok
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-red-500/10 text-red-400 border-red-500/20'
      }`}>
        {ok ? 'OK' : 'At risk'}
      </span>
    </div>
  )
}

export function SecurityCheck() {
  const { results, securityStatus, setSecurityStatus } = useStore()
  const { scan } = useScan()

  const findings = results.security?.findings ?? []

  useEffect(() => {
    window.api?.getSecurity()
      .then((s: SecurityStatus) => setSecurityStatus(s))
      .catch(() => {})
  }, [])

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const highCount = findings.filter(f => f.severity === 'high').length
  const allClear = findings.length === 0

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Security Check</h2>
          <p className="text-sm text-slate-500 mt-0.5">Defender, firewall, UAC, and system hardening</p>
        </div>
        <ScanButton module="security" onScan={() => scan('security')} />
      </div>

      {/* Overview badge */}
      {results.security && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          criticalCount > 0
            ? 'bg-red-500/5 border-red-500/20'
            : highCount > 0
            ? 'bg-orange-500/5 border-orange-500/20'
            : 'bg-green-500/5 border-green-500/20'
        }`}>
          {allClear
            ? <ShieldCheck size={24} className="text-success" />
            : <ShieldX size={24} className="text-danger" />
          }
          <div>
            <p className="font-medium text-slate-200">
              {allClear
                ? 'Security looks good'
                : `${findings.length} security issue${findings.length !== 1 ? 's' : ''} found`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {allClear
                ? 'All core security features are active'
                : `${criticalCount} critical, ${highCount} high priority`}
            </p>
          </div>
        </div>
      )}

      {/* Status checklist */}
      {securityStatus && (
        <div className="card">
          <p className="section-header">Status checklist</p>
          <StatusRow
            label="Windows Defender (Antivirus)"
            ok={securityStatus.defenderEnabled}
            value={securityStatus.defenderLastScan
              ? `Last scan: ${new Date(securityStatus.defenderLastScan).toLocaleDateString()}`
              : undefined}
          />
          <StatusRow label="Windows Firewall"      ok={securityStatus.firewallEnabled} />
          <StatusRow label="User Account Control"  ok={securityStatus.uacEnabled} />
          <StatusRow
            label="Windows Updates"
            ok={securityStatus.windowsUpdatePending === 0}
            value={securityStatus.windowsUpdatePending > 0
              ? `${securityStatus.windowsUpdatePending} pending`
              : 'Up to date'}
          />
          <StatusRow
            label="Guest account"
            ok={!securityStatus.guestAccountEnabled}
            value={securityStatus.guestAccountEnabled ? 'Enabled' : 'Disabled'}
          />
          <StatusRow
            label="AutoRun (USB / discs)"
            ok={!securityStatus.autorunEnabled}
            value={securityStatus.autorunEnabled ? 'Enabled' : 'Disabled'}
          />
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <p className="section-header">Issues ({findings.length})</p>
          <div className="space-y-2">
            {findings
              .sort((a, b) => {
                const w = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
                return (w[a.severity] ?? 5) - (w[b.severity] ?? 5)
              })
              .map(f => <FindingCard key={f.id} finding={f} />)
            }
          </div>
        </div>
      )}

      {results.security && findings.length === 0 && (
        <div className="card text-center py-10">
          <ShieldCheck size={32} className="text-success mx-auto mb-3" />
          <p className="text-sm text-slate-400">No security issues found</p>
        </div>
      )}
    </div>
  )
}
