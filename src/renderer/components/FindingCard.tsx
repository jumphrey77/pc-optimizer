import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Shield, Zap,
  BookOpen, AlertTriangle, CheckCircle, RotateCcw
} from 'lucide-react'
import { SeverityBadge } from './SeverityBadge'
import type { Finding } from '../../shared/types'

interface Props {
  finding: Finding
  onFix?: (f: Finding) => Promise<void>
  onSkip?: (f: Finding) => void
  compact?: boolean
}

const FIX_ICONS = {
  automatic: Zap,
  guided:    BookOpen,
  manual:    ChevronRight,
  none:      AlertTriangle,
}

const FIX_LABELS = {
  automatic: 'Fix automatically',
  guided:    'Show me how',
  manual:    'Manual steps',
  none:      'Informational',
}

export function FindingCard({ finding, onFix, onSkip, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [fixed, setFixed] = useState(false)

  const FixIcon = FIX_ICONS[finding.fixType]

  async function handleFix() {
    if (!onFix || fixing || fixed) return
    setFixing(true)
    try {
      await onFix(finding)
      setFixed(true)
    } finally {
      setFixing(false)
    }
  }

  if (fixed) {
    return (
      <div className="card-sm flex items-center gap-3 opacity-60 slide-in">
        <CheckCircle size={16} className="text-success shrink-0" />
        <span className="text-sm text-slate-400 line-through">{finding.title}</span>
        <span className="ml-auto text-xs text-success">Fixed</span>
      </div>
    )
  }

  return (
    <div className={`card-sm border slide-in sev-bg-${finding.severity} transition-all`}>
      {/* Header row */}
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="mt-0.5">
          {expanded
            ? <ChevronDown size={15} className="text-slate-500" />
            : <ChevronRight size={15} className="text-slate-500" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-100 leading-snug">
              {finding.title}
            </span>
            {finding.requiresElevation && (
              <Shield size={11} className="text-amber-400 shrink-0" title="Requires admin" />
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{finding.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {finding.estimatedBytesSaved && finding.estimatedBytesSaved > 0 && (
            <span className="text-xs text-slate-400">{formatBytes(finding.estimatedBytesSaved)}</span>
          )}
          <SeverityBadge severity={finding.severity} />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pl-5 space-y-3">
          <p className="text-sm text-slate-400 leading-relaxed">{finding.description}</p>

          {/* Evidence */}
          {finding.evidence.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">Evidence</p>
              <div className="space-y-1">
                {finding.evidence.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <code className="text-xs bg-surface text-slate-400 px-2 py-1 rounded font-mono flex-1 truncate">
                      {e}
                    </code>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-slate-300 transition-opacity"
                      onClick={() => navigator.clipboard.writeText(e)}
                    >
                      copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rollback info */}
          {finding.rollbackSupported && finding.rollbackPlan && (
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <RotateCcw size={12} className="mt-0.5 shrink-0 text-slate-600" />
              <span>{finding.rollbackPlan}</span>
            </div>
          )}

          {/* Actions */}
          {finding.fixType !== 'none' && (
            <div className="flex items-center gap-2 pt-1">
              {onFix && finding.fixType === 'automatic' && (
                <button
                  className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleFix}
                  disabled={fixing}
                >
                  <FixIcon size={13} />
                  {fixing ? 'Fixing…' : FIX_LABELS[finding.fixType]}
                </button>
              )}
              {onFix && finding.fixType === 'guided' && (
                <button className="btn-ghost text-xs" onClick={handleFix}>
                  <FixIcon size={13} />
                  {FIX_LABELS[finding.fixType]}
                </button>
              )}
              {onSkip && (
                <button className="btn-ghost text-xs" onClick={() => onSkip(finding)}>
                  Skip
                </button>
              )}
              {finding.helpUrl && (
                <button
                  className="btn-ghost text-xs ml-auto"
                  onClick={() => window.api?.openUrl(finding.helpUrl!)}
                >
                  Learn more
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}
