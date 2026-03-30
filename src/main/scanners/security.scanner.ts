import { execSync } from 'child_process'
import log from 'electron-log'
import type { SecurityStatus, Finding, ScanResult } from '../../shared/types'

function ps(command: string): string {
  try {
    return execSync(`powershell -NoProfile -Command "${command}"`, { timeout: 8000 }).toString().trim()
  } catch {
    return ''
  }
}

export async function getSecurityStatus(): Promise<SecurityStatus> {
  const defenderStatus = ps(`(Get-MpComputerStatus).AntivirusEnabled`)
  const defenderScan = ps(`(Get-MpComputerStatus).QuickScanEndTime`)
  const firewallDomain = ps(`(Get-NetFirewallProfile -Profile Domain).Enabled`)
  const uacLevel = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA`)
  const pendingUpdates = ps(`(Get-WUList -NotInstalled 2>$null | Measure-Object).Count`)
  const guestAccount = ps(`(Get-LocalUser -Name 'Guest' 2>$null).Enabled`)
  const autorun = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -ErrorAction SilentlyContinue).NoDriveTypeAutoRun`)

  return {
    defenderEnabled: defenderStatus.toLowerCase() === 'true',
    defenderLastScan: defenderScan || undefined,
    firewallEnabled: firewallDomain.toLowerCase() === 'true',
    uacEnabled: uacLevel === '1',
    windowsUpdatePending: parseInt(pendingUpdates) || 0,
    guestAccountEnabled: guestAccount.toLowerCase() === 'true',
    autorunEnabled: autorun === '' || autorun === '0'
  }
}

export async function scanSecurity(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const findings: Finding[] = []
  const errors: string[] = []

  try {
    const status = await getSecurityStatus()

    if (!status.defenderEnabled) {
      findings.push({
        id: 'sec-defender-off',
        module: 'security',
        severity: 'critical',
        title: 'Windows Defender is disabled',
        description: 'Real-time antivirus protection is off. This leaves your PC vulnerable to malware.',
        evidence: ['Windows Defender: Disabled'],
        fixType: 'guided',
        requiresElevation: true,
        rollbackSupported: false,
        helpUrl: 'https://support.microsoft.com/en-us/windows/turn-on-microsoft-defender-antivirus'
      })
    }

    if (!status.firewallEnabled) {
      findings.push({
        id: 'sec-firewall-off',
        module: 'security',
        severity: 'high',
        title: 'Windows Firewall is disabled',
        description: 'The Windows Firewall helps block unauthorised network connections.',
        evidence: ['Firewall (Domain profile): Disabled'],
        fixType: 'guided',
        requiresElevation: true,
        rollbackSupported: false,
      })
    }

    if (!status.uacEnabled) {
      findings.push({
        id: 'sec-uac-off',
        module: 'security',
        severity: 'high',
        title: 'User Account Control (UAC) is disabled',
        description: 'UAC prevents apps from making admin-level changes without your knowledge.',
        evidence: ['EnableLUA = 0'],
        fixType: 'guided',
        requiresElevation: true,
        rollbackSupported: false,
      })
    }

    if (status.windowsUpdatePending > 0) {
      findings.push({
        id: 'sec-pending-updates',
        module: 'security',
        severity: status.windowsUpdatePending > 5 ? 'high' : 'medium',
        title: `${status.windowsUpdatePending} Windows updates pending`,
        description: 'Pending updates may include important security patches.',
        evidence: [`${status.windowsUpdatePending} updates available`],
        fixType: 'guided',
        requiresElevation: false,
        rollbackSupported: false,
      })
    }

    if (status.guestAccountEnabled) {
      findings.push({
        id: 'sec-guest-enabled',
        module: 'security',
        severity: 'medium',
        title: 'Guest account is enabled',
        description: 'The Windows Guest account allows anyone to log in without a password.',
        evidence: ['Guest account: Enabled'],
        fixType: 'automatic',
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: 'Guest account can be re-enabled from User Accounts in Control Panel.'
      })
    }

    if (status.autorunEnabled) {
      findings.push({
        id: 'sec-autorun-enabled',
        module: 'security',
        severity: 'low',
        title: 'AutoRun is enabled for removable drives',
        description: 'AutoRun can automatically execute files when USB drives or discs are inserted.',
        evidence: ['NoDriveTypeAutoRun policy not set'],
        fixType: 'automatic',
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: 'AutoRun policy key will be backed up before change.'
      })
    }

  } catch (e: any) {
    errors.push(e.message)
    log.error('scanSecurity error', e)
  }

  return {
    module: 'security',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    errors
  }
}
