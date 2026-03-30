import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useScan } from '../hooks/useScan'
import { ScanButton } from '../components/ScanButton'
import { FindingCard } from '../components/FindingCard'
import { DriveBar } from '../components/DriveBar'
import { DiskTreemap } from '../components/DiskTreemap'
import type { DiskNode } from '../../shared/types'

export function DiskSpace() {
  const { results, drives, setDrives } = useStore()
  const { scan } = useScan()
  const [treeData, setTreeData] = useState<DiskNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)

  const diskResult = results.disk
  const findings = diskResult?.findings ?? []

  useEffect(() => {
    window.api?.getDrives().then(d => setDrives(d)).catch(() => {})
  }, [])

  async function loadTree() {
    setTreeLoading(true)
    try {
      const data = await window.api?.getDiskTree('C:\\')
      setTreeData(data ?? [])
    } finally {
      setTreeLoading(false)
    }
  }

  async function handleFix(finding: any) {
    await window.api?.applyFix(finding.id)
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Disk Space</h2>
          <p className="text-sm text-slate-500 mt-0.5">Drive usage, large folders, and cache cleanup</p>
        </div>
        <ScanButton module="disk" onScan={() => scan('disk')} />
      </div>

      {/* Drive bars */}
      {drives.length > 0 && (
        <div className="card">
          <p className="section-header">Drives</p>
          <div className="space-y-4">
            {drives.map(d => <DriveBar key={d.letter} drive={d} />)}
          </div>
        </div>
      )}

      {/* Treemap */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="section-header mb-0">C:\\ folder breakdown</p>
          <button
            className="btn-ghost text-xs"
            onClick={loadTree}
            disabled={treeLoading}
          >
            {treeLoading ? 'Loading…' : 'Load treemap'}
          </button>
        </div>
        <DiskTreemap nodes={treeData} />
      </div>

      {/* Findings */}
      <div>
        <p className="section-header">
          Disk findings {findings.length > 0 && `(${findings.length})`}
        </p>
        {findings.length === 0 ? (
          <div className="card text-center py-10 text-slate-600 text-sm">
            {diskResult ? 'No disk issues found.' : 'Run a scan to check disk health.'}
          </div>
        ) : (
          <div className="space-y-2">
            {findings
              .sort((a, b) => (b.estimatedBytesSaved ?? 0) - (a.estimatedBytesSaved ?? 0))
              .map(f => (
                <FindingCard key={f.id} finding={f} onFix={handleFix} />
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
