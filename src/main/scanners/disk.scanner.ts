import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import log from 'electron-log'
import type { DriveInfo, DiskNode, DiskCategory, Finding, ScanResult } from '../../shared/types'

const KNOWN_CACHE_PATHS = [
  { rel: 'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', label: 'Chrome cache', category: 'cache' as DiskCategory },
  { rel: 'AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache', label: 'Edge cache', category: 'cache' as DiskCategory },
  { rel: 'AppData\\Local\\Temp', label: 'User temp', category: 'cache' as DiskCategory },
  { rel: 'AppData\\Local\\npm-cache', label: 'npm cache', category: 'dev' as DiskCategory },
  { rel: 'AppData\\Local\\pip\\Cache', label: 'pip cache', category: 'dev' as DiskCategory },
  { rel: 'AppData\\Roaming\\Code\\logs', label: 'VS Code logs', category: 'dev' as DiskCategory },
]

const GAME_PATHS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Epic Games',
  'C:\\Program Files\\EA Games',
  'C:\\XboxGames',
]

export async function getDrives(): Promise<DriveInfo[]> {
  try {
    const ps = `Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json`
    const raw = execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 }).toString()
    const data = JSON.parse(raw)
    const disks = Array.isArray(data) ? data : [data]
    return disks.map(d => ({
      letter: d.DeviceID,
      label: d.VolumeName || 'Local Disk',
      totalBytes: parseInt(d.Size || '0'),
      freeBytes: parseInt(d.FreeSpace || '0'),
      usedBytes: parseInt(d.Size || '0') - parseInt(d.FreeSpace || '0')
    }))
  } catch (e) {
    log.warn('getDrives fallback', e)
    // Fallback: return mock data so UI doesn't break on non-Windows dev
    return [{
      letter: 'C:',
      label: 'Local Disk',
      totalBytes: 500 * 1024 * 1024 * 1024,
      freeBytes: 120 * 1024 * 1024 * 1024,
      usedBytes: 380 * 1024 * 1024 * 1024
    }]
  }
}

function getDirSize(dirPath: string, maxDepth = 3, currentDepth = 0): number {
  if (currentDepth > maxDepth) return 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name)
      try {
        if (entry.isFile()) {
          total += fs.statSync(full).size
        } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
          total += getDirSize(full, maxDepth, currentDepth + 1)
        }
      } catch { /* skip inaccessible */ }
    }
    return total
  } catch {
    return 0
  }
}

function categorise(fullPath: string): DiskCategory {
  const lower = fullPath.toLowerCase()
  if (lower.includes('windows') || lower.includes('program files\\common')) return 'system'
  if (lower.includes('steam') || lower.includes('epic games') || lower.includes('ea games') || lower.includes('xboxgames')) return 'games'
  if (lower.includes('npm') || lower.includes('node_modules') || lower.includes('pip') || lower.includes('code\\extensions')) return 'dev'
  if (lower.includes('cache') || lower.includes('temp') || lower.includes('tmp')) return 'cache'
  if (lower.includes('pictures') || lower.includes('videos') || lower.includes('music') || lower.includes('photos')) return 'media'
  if (lower.includes('users') || lower.includes('documents') || lower.includes('downloads') || lower.includes('desktop')) return 'user'
  return 'other'
}

export async function getDiskTree(rootPath = 'C:\\'): Promise<DiskNode[]> {
  const results: DiskNode[] = []
  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(rootPath, entry.name)
      try {
        const size = getDirSize(full, 2)
        if (size < 1024 * 1024) continue  // skip < 1MB
        results.push({
          name: entry.name,
          path: full,
          size,
          category: categorise(full)
        })
      } catch { /* skip */ }
    }
    results.sort((a, b) => b.size - a.size)
    return results.slice(0, 50)
  } catch (e) {
    log.error('getDiskTree error', e)
    return []
  }
}

export async function scanDisk(): Promise<ScanResult> {
  const startedAt = new Date().toISOString()
  const findings: Finding[] = []
  const errors: string[] = []

  try {
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\User'

    // Check Windows Temp
    const winTemp = 'C:\\Windows\\Temp'
    const winTempSize = getDirSize(winTemp, 1)
    if (winTempSize > 500 * 1024 * 1024) {
      findings.push({
        id: 'disk-win-temp',
        module: 'disk',
        severity: winTempSize > 2 * 1024 * 1024 * 1024 ? 'high' : 'medium',
        title: 'Windows Temp folder is large',
        description: 'The Windows Temp folder contains files that are safe to remove.',
        evidence: [`C:\\Windows\\Temp — ${formatBytes(winTempSize)}`],
        estimatedBytesSaved: winTempSize,
        fixType: 'automatic',
        requiresElevation: true,
        rollbackSupported: false,
        rollbackPlan: 'Temp files cannot be restored — they are by definition disposable.'
      })
    }

    // Check user temp
    const userTemp = path.join(userProfile, 'AppData\\Local\\Temp')
    const userTempSize = getDirSize(userTemp, 1)
    if (userTempSize > 200 * 1024 * 1024) {
      findings.push({
        id: 'disk-user-temp',
        module: 'disk',
        severity: 'low',
        title: 'User Temp folder has accumulated files',
        description: 'Your personal Temp folder contains files that apps forgot to clean up.',
        evidence: [`${userTemp} — ${formatBytes(userTempSize)}`],
        estimatedBytesSaved: userTempSize,
        fixType: 'automatic',
        requiresElevation: false,
        rollbackSupported: false,
      })
    }

    // Check known cache paths
    for (const cp of KNOWN_CACHE_PATHS) {
      const full = path.join(userProfile, cp.rel)
      if (!fs.existsSync(full)) continue
      const size = getDirSize(full, 1)
      if (size > 100 * 1024 * 1024) {
        findings.push({
          id: `disk-cache-${cp.label.replace(/\s/g, '-').toLowerCase()}`,
          module: 'disk',
          severity: size > 1024 * 1024 * 1024 ? 'high' : 'medium',
          title: `${cp.label} is using ${formatBytes(size)}`,
          description: `This cache is safe to clear. The app will rebuild it as needed.`,
          evidence: [full],
          estimatedBytesSaved: size,
          fixType: 'automatic',
          requiresElevation: false,
          rollbackSupported: false,
        })
      }
    }

    // Check for WSL disk image
    const wslPaths = [
      path.join(userProfile, 'AppData\\Local\\Packages'),
    ]
    for (const wslBase of wslPaths) {
      if (!fs.existsSync(wslBase)) continue
      try {
        const pkgs = fs.readdirSync(wslBase)
        for (const pkg of pkgs) {
          if (!pkg.toLowerCase().includes('ubuntu') && !pkg.toLowerCase().includes('debian') && !pkg.toLowerCase().includes('kali')) continue
          const vhdx = path.join(wslBase, pkg, 'LocalState', 'ext4.vhdx')
          if (fs.existsSync(vhdx)) {
            const size = fs.statSync(vhdx).size
            findings.push({
              id: 'disk-wsl-vhdx',
              module: 'disk',
              severity: size > 20 * 1024 * 1024 * 1024 ? 'high' : 'medium',
              title: `WSL disk image is ${formatBytes(size)}`,
              description: 'The WSL virtual disk can grow large. You can compact it with "wsl --shutdown" followed by "diskpart" optimize.',
              evidence: [vhdx],
              estimatedBytesSaved: Math.floor(size * 0.3),
              fixType: 'guided',
              requiresElevation: true,
              rollbackSupported: false,
            })
          }
        }
      } catch { /* skip */ }
    }

    // Check hibernation file
    const hiberfil = 'C:\\hiberfil.sys'
    if (fs.existsSync(hiberfil)) {
      try {
        const size = fs.statSync(hiberfil).size
        if (size > 1024 * 1024 * 1024) {
          findings.push({
            id: 'disk-hiberfil',
            module: 'disk',
            severity: 'low',
            title: `Hibernation file using ${formatBytes(size)}`,
            description: 'If you never use hibernation (Sleep is different), this file can be removed by disabling hibernate.',
            evidence: [hiberfil],
            estimatedBytesSaved: size,
            fixType: 'guided',
            requiresElevation: true,
            rollbackSupported: true,
            rollbackPlan: 'Re-enable hibernation with "powercfg /hibernate on" to recreate the file.'
          })
        }
      } catch { /* skip */ }
    }

    // Check for game libraries on C:
    for (const gp of GAME_PATHS) {
      if (!fs.existsSync(gp)) continue
      const size = getDirSize(gp, 2)
      if (size > 10 * 1024 * 1024 * 1024) {
        findings.push({
          id: `disk-games-${path.basename(gp).replace(/\s/g, '-').toLowerCase()}`,
          module: 'disk',
          severity: size > 50 * 1024 * 1024 * 1024 ? 'high' : 'medium',
          title: `${path.basename(gp)} library on C: — ${formatBytes(size)}`,
          description: 'Game libraries are large and are good candidates to move to a secondary drive (D:).',
          evidence: [gp],
          estimatedBytesSaved: size,
          fixType: 'guided',
          requiresElevation: false,
          rollbackSupported: true,
          rollbackPlan: 'Change the library path back in the launcher settings.'
        })
      }
    }

  } catch (e: any) {
    errors.push(e.message)
    log.error('scanDisk error', e)
  }

  return {
    module: 'disk',
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    errors
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
