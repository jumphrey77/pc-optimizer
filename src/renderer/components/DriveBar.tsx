import type { DriveInfo } from '../../shared/types'

interface Props {
  drive: DriveInfo
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(0)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${b} B`
}

function getBarColor(pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 75) return '#f59e0b'
  if (pct >= 60) return '#4f8ef7'
  return '#22c55e'
}

export function DriveBar({ drive }: Props) {
  const pct = drive.totalBytes > 0
    ? Math.round((drive.usedBytes / drive.totalBytes) * 100)
    : 0
  const color = getBarColor(pct)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">{drive.letter}</span>
          <span className="text-slate-500">{drive.label}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>{formatBytes(drive.freeBytes)} free</span>
          <span className="text-slate-600">/</span>
          <span>{formatBytes(drive.totalBytes)}</span>
          <span style={{ color }} className="font-semibold w-10 text-right">{pct}%</span>
        </div>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full rounded-full fill-bar"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
