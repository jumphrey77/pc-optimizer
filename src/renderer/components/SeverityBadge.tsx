import type { Severity } from '../../shared/types'

interface Props {
  severity: Severity
  className?: string
}

const LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

const CLASSES: Record<Severity, string> = {
  critical: 'sev-bg-critical text-red-400',
  high:     'sev-bg-high text-orange-400',
  medium:   'sev-bg-medium text-amber-400',
  low:      'sev-bg-low text-blue-400',
  info:     'sev-bg-info text-slate-400',
}

export function SeverityBadge({ severity, className = '' }: Props) {
  return (
    <span className={`badge border ${CLASSES[severity]} ${className}`}>
      {LABELS[severity]}
    </span>
  )
}

export function severityColor(s: Severity): string {
  return {
    critical: '#ef4444',
    high:     '#f97316',
    medium:   '#f59e0b',
    low:      '#4f8ef7',
    info:     '#64748b',
  }[s]
}

export function severityOrder(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5
}
