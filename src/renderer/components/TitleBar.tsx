import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  const minimize = () => (window as any).api?.winMinimize?.()
  const maximize = () => (window as any).api?.winMaximize?.()
  const close    = () => (window as any).api?.winClose?.()

  return (
    <div
      className="flex items-center justify-between h-9 px-4 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* App name - left side */}
      <span className="text-xs text-slate-500 font-medium">PC Optimizer</span>

      {/* Window controls - right side, no-drag so buttons are clickable */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          onClick={minimize}
          className="w-7 h-7 flex items-center justify-center rounded
                     text-slate-500 hover:text-slate-200 hover:bg-surface-tertiary
                     transition-colors"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={maximize}
          className="w-7 h-7 flex items-center justify-center rounded
                     text-slate-500 hover:text-slate-200 hover:bg-surface-tertiary
                     transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={close}
          className="w-7 h-7 flex items-center justify-center rounded
                     text-slate-500 hover:text-white hover:bg-red-600
                     transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
