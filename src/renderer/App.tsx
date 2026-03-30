import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { DiskSpace } from './pages/DiskSpace'
import { AppAudit } from './pages/AppAudit'
import { StartupLoad } from './pages/StartupLoad'
import { RegistryHealth } from './pages/RegistryHealth'
import { SecurityCheck } from './pages/SecurityCheck'
import { SafetyCenter } from './pages/SafetyCenter'

export default function App() {
  const activeModule = useStore(s => s.activeModule)

  const pages: Record<string, JSX.Element> = {
    dashboard: <Dashboard />,
    disk:      <DiskSpace />,
    apps:      <AppAudit />,
    startup:   <StartupLoad />,
    registry:  <RegistryHealth />,
    security:  <SecurityCheck />,
    safety:    <SafetyCenter />,
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {pages[activeModule] ?? <Dashboard />}
      </main>
    </div>
  )
}
