import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import type { Module } from '../../shared/types'
import { useStore } from '../store/useStore'

interface Props {
  module: Module
  onScan: () => void
  label?: string
}

export function ScanButton({ module, onScan, label = 'Scan now' }: Props) {
  const status = useStore(s => s.status[module])
  const lastScanned = useStore(s => s.lastScanned[module])

  const isScanning = status === 'scanning'

  function formatTime(iso: string | null): string {
    if (!iso) return 'Never scanned'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="flex items-center gap-3">
      {lastScanned && status === 'done' && (
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <CheckCircle size={11} className="text-success" />
          {formatTime(lastScanned)}
        </span>
      )}
      {status === 'error' && (
        <span className="text-xs text-danger flex items-center gap-1">
          <AlertCircle size={11} />
          Scan error
        </span>
      )}
      <button
        className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onScan}
        disabled={isScanning}
      >
        <RefreshCw size={13} className={isScanning ? 'scanning' : ''} />
        {isScanning ? 'Scanning…' : label}
      </button>
    </div>
  )
}
