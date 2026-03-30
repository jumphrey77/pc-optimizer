import {
  LayoutDashboard, HardDrive, Package,
  Rocket, Database, Shield, ShieldCheck
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Module } from '../../shared/types'

type NavTarget = Module | 'dashboard' | 'safety'

interface NavItem {
  id: NavTarget
  label: string
  Icon: any
  badge?: number
}

export function Sidebar() {
  const { activeModule, setActiveModule, results, status } = useStore()

  function findingCount(module: Module): number {
    return results[module]?.findings.length ?? 0
  }

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard',     Icon: LayoutDashboard },
    { id: 'disk',      label: 'Disk Space',    Icon: HardDrive,  badge: findingCount('disk') },
    { id: 'apps',      label: 'App Audit',     Icon: Package,    badge: findingCount('apps') },
    { id: 'startup',   label: 'Startup',       Icon: Rocket,     badge: findingCount('startup') },
    { id: 'registry',  label: 'Registry',      Icon: Database,   badge: findingCount('registry') },
    { id: 'security',  label: 'Security',      Icon: Shield,     badge: findingCount('security') },
    { id: 'safety',    label: 'Safety Center', Icon: ShieldCheck },
  ]

  return (
    <aside className="w-52 shrink-0 bg-surface-secondary border-r border-surface-border
                      flex flex-col h-full select-none">
      {/* App header */}
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center">
            <ShieldCheck size={15} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">PC Optimizer</p>
            <p className="text-xs text-slate-600">v1.0</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ id, label, Icon, badge }) => {
          const isActive = activeModule === id
          const isScanning = id !== 'dashboard' && id !== 'safety' && status[id as Module] === 'scanning'

          return (
            <button
              key={id}
              className={`nav-item w-full ${isActive ? 'active' : ''}`}
              onClick={() => setActiveModule(id)}
            >
              <Icon size={15} className={isActive ? 'text-slate-300' : ''} />
              <span className="flex-1 text-left">{label}</span>
              {isScanning && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand scanning" />
              )}
              {!isScanning && badge !== undefined && badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface text-slate-400 min-w-[20px] text-center">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom hint */}
      <div className="px-4 py-4 border-t border-surface-border">
        <p className="text-xs text-slate-600 leading-relaxed">
          Always create a restore point before applying fixes.
        </p>
      </div>
    </aside>
  )
}
