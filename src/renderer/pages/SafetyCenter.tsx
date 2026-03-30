import { useEffect, useState } from 'react'
import { RotateCcw, Shield, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ActionLog } from '../../shared/types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function SafetyCenter() {
  const { actionLog, setActionLog } = useStore()
  const [restoreDesc, setRestoreDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const [rollbackList, setRollbackList] = useState<any[]>([])

  useEffect(() => {
    window.api?.getActionLog().then(setActionLog).catch(() => {})
    window.api?.getRollbackList().then(setRollbackList).catch(() => {})
  }, [])

  async function handleCreateRestorePoint() {
    setCreating(true)
    const desc = restoreDesc.trim() || 'PC Optimizer checkpoint'
    try {
      await window.api?.createRestorePoint(desc)
      setCreated(true)
      setRestoreDesc('')
      setTimeout(() => setCreated(false), 3000)
    } finally {
      setCreating(false)
    }
  }

  async function handleRollback(logId: string) {
    const result = await window.api?.rollbackAction(logId)
    if (result?.success) {
      window.api?.getActionLog().then(setActionLog).catch(() => {})
      window.api?.getRollbackList().then(setRollbackList).catch(() => {})
    }
  }

  async function handleClearLog() {
    await window.api?.clearActionLog()
    setActionLog([])
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Safety Center</h2>
        <p className="text-sm text-slate-500 mt-0.5">Restore points, rollback history, and action log</p>
      </div>

      {/* Safety notice */}
      <div className="flex items-start gap-3 bg-brand/5 border border-brand/20 rounded-xl p-4">
        <Shield size={16} className="text-brand mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-slate-200">Before applying fixes</p>
          <p className="text-xs text-slate-500 mt-1">
            PC Optimizer automatically creates a .reg backup before any registry change.
            For system-level fixes, create a Windows Restore Point first — it lets you
            roll back your entire system if anything goes wrong.
          </p>
        </div>
      </div>

      {/* Create restore point */}
      <div className="card">
        <p className="section-header">Create restore point</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Restore point name (optional)"
            value={restoreDesc}
            onChange={e => setRestoreDesc(e.target.value)}
            className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2
                       text-sm text-slate-300 placeholder-slate-600
                       focus:outline-none focus:border-brand/50"
          />
          <button
            className="btn-primary disabled:opacity-50"
            onClick={handleCreateRestorePoint}
            disabled={creating}
          >
            {created
              ? <><CheckCircle size={14} /> Created</>
              : creating
              ? 'Creating…'
              : <><Shield size={14} /> Create</>
            }
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Requires admin privileges. Rate-limited by Windows to one per 24 hours.
        </p>
      </div>

      {/* Rollback queue */}
      {rollbackList.length > 0 && (
        <div className="card">
          <p className="section-header">Available rollbacks ({rollbackList.length})</p>
          <div className="space-y-2">
            {rollbackList.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-3 py-2 border-b border-surface-border last:border-0">
                <RotateCcw size={14} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{entry.findingTitle}</p>
                  <p className="text-xs text-slate-600">{formatDate(entry.timestamp)}</p>
                </div>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => handleRollback(entry.id)}
                >
                  <RotateCcw size={12} />
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action log */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="section-header mb-0">Action log ({actionLog.length})</p>
          {actionLog.length > 0 && (
            <button
              className="btn-ghost text-xs text-danger/70 hover:text-danger"
              onClick={handleClearLog}
            >
              <Trash2 size={12} />
              Clear log
            </button>
          )}
        </div>

        {actionLog.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            No actions recorded yet
          </div>
        ) : (
          <div className="space-y-0 max-h-96 overflow-y-auto">
            {actionLog.map((entry: ActionLog) => (
              <div key={entry.id}
                   className="flex items-start gap-3 py-2.5 border-b border-surface-border last:border-0">
                {entry.outcome === 'success'
                  ? <CheckCircle size={14} className="text-success mt-0.5 shrink-0" />
                  : entry.outcome === 'failed'
                  ? <XCircle size={14} className="text-danger mt-0.5 shrink-0" />
                  : <Clock size={14} className="text-amber-400 mt-0.5 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300 truncate">{entry.findingTitle}</span>
                    <span className={`badge text-xs border ${
                      entry.action === 'fix'
                        ? 'bg-brand/10 text-brand border-brand/20'
                        : entry.action === 'rollback'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-slate-700/50 text-slate-500 border-slate-700'
                    }`}>
                      {entry.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 truncate">{entry.detail}</p>
                </div>
                <span className="text-xs text-slate-600 shrink-0 whitespace-nowrap">
                  {formatDate(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
