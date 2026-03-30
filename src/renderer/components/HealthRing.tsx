interface Props {
  score: number   // 0–100
  size?: number
}

function scoreColor(s: number): string {
  if (s >= 80) return '#22c55e'
  if (s >= 60) return '#f59e0b'
  if (s >= 40) return '#f97316'
  return '#ef4444'
}

function scoreLabel(s: number): string {
  if (s >= 80) return 'Good'
  if (s >= 60) return 'Fair'
  if (s >= 40) return 'Poor'
  return 'Critical'
}

export function HealthRing({ score, size = 120 }: Props) {
  const r = (size / 2) - 10
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = scoreColor(score)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="#1e2535"
          strokeWidth={8}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke 0.4s' }}
        />
        {/* Score text */}
        <text
          x={size / 2} y={size / 2 - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={size * 0.22}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {score}
        </text>
        <text
          x={size / 2} y={size / 2 + 16}
          textAnchor="middle"
          fill="#64748b"
          fontSize={11}
          fontFamily="Inter, sans-serif"
        >
          {scoreLabel(score)}
        </text>
      </svg>
    </div>
  )
}
