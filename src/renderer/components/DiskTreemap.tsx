import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import type { DiskNode, DiskCategory } from '../../shared/types'

interface Props {
  nodes: DiskNode[]
  onSelect?: (node: DiskNode) => void
}

const CATEGORY_COLORS: Record<DiskCategory, string> = {
  system: '#334155',
  user:   '#1d4ed8',
  games:  '#7c3aed',
  cache:  '#b45309',
  dev:    '#0f766e',
  media:  '#be185d',
  other:  '#374151',
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${b} B`
}

function CustomContent(props: any) {
  const { x, y, width, height, name, root, value, category } = props
  if (width < 30 || height < 20) return null
  const color = CATEGORY_COLORS[category as DiskCategory] || '#374151'
  const showText = width > 60 && height > 30

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        rx={4}
        fill={color}
        fillOpacity={0.85}
        stroke="#0f1117"
        strokeWidth={1}
      />
      {showText && (
        <>
          <text
            x={x + 8} y={y + 18}
            fill="#e2e8f0"
            fontSize={Math.min(12, width / 6)}
            fontFamily="Inter, sans-serif"
            fontWeight={500}
          >
            {name.length > 16 ? name.slice(0, 14) + '…' : name}
          </text>
          {height > 44 && (
            <text
              x={x + 8} y={y + 32}
              fill="#94a3b8"
              fontSize={10}
              fontFamily="Inter, sans-serif"
            >
              {formatBytes(value)}
            </text>
          )}
        </>
      )}
    </g>
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, path: nodePath, category } = payload[0].payload
  return (
    <div className="card-sm text-xs shadow-xl z-50">
      <p className="font-medium text-slate-200 mb-1">{name}</p>
      <p className="text-slate-400 font-mono truncate max-w-xs mb-1">{nodePath}</p>
      <p className="text-slate-300">{formatBytes(value)}</p>
      <span className="badge mt-1" style={{ background: CATEGORY_COLORS[category as DiskCategory] + '33', color: '#94a3b8' }}>
        {category}
      </span>
    </div>
  )
}

export function DiskTreemap({ nodes, onSelect }: Props) {
  const data = nodes.map(n => ({
    name: n.name,
    size: n.size,
    path: n.path,
    category: n.category,
  }))

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-600 text-sm">
        No data — run a disk scan first
      </div>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          content={<CustomContent />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-xs text-slate-500 capitalize">{cat}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
