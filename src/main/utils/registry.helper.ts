import { spawnSync } from 'child_process'

export interface RegValue {
  name: string
  type: string
  value: string
}

/** Run reg.exe silently - swallows all errors and stderr */
function reg(args: string[], timeoutMs = 15000): string {
  try {
    const result = spawnSync('reg.exe', args, {
      timeout: timeoutMs,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']  // stdin=ignore, stdout=pipe, stderr=ignore
    })
    if (result.status === 0 && result.stdout) return result.stdout
    return ''
  } catch {
    return ''
  }
}

/** Run powershell silently */
export function ps(command: string, timeoutMs = 10000): string {
  try {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', command
    ], {
      timeout: timeoutMs,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    if (result.stdout) return result.stdout.trim()
    return ''
  } catch {
    return ''
  }
}

export function queryValues(keyPath: string): RegValue[] {
  return parseRegOutput(reg(['query', keyPath]))
}

export function querySubkeys(keyPath: string): string[] {
  const raw = reg(['query', keyPath])
  if (!raw) return []
  return raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.toUpperCase().startsWith('HKEY_') && l.toUpperCase() !== keyPath.toUpperCase())
}

export function querySubkeyValues(parentKey: string): Map<string, RegValue[]> {
  const result = new Map<string, RegValue[]>()
  const subkeys = querySubkeys(parentKey)
  for (const sk of subkeys) {
    result.set(sk, queryValues(sk))
  }
  return result
}

export function deleteValue(keyPath: string, valueName: string): boolean {
  reg(['delete', keyPath, '/v', valueName, '/f'])
  return true
}

export function deleteKey(keyPath: string): boolean {
  reg(['delete', keyPath, '/f'])
  return true
}

export function exportKey(keyPath: string, destFile: string): boolean {
  reg(['export', keyPath, destFile, '/y'])
  return true
}

export function importFile(regFile: string): boolean {
  reg(['import', regFile])
  return true
}

export function valMap(values: RegValue[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const v of values) m[v.name.toLowerCase()] = v.value
  return m
}

function parseRegOutput(raw: string): RegValue[] {
  if (!raw) return []
  const results: RegValue[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toUpperCase().startsWith('HKEY_')) continue
    const parts = trimmed.split(/\s{2,}/)
    if (parts.length >= 3) {
      results.push({ name: parts[0], type: parts[1], value: parts.slice(2).join('  ') })
    } else if (parts.length === 2) {
      results.push({ name: parts[0], type: parts[1], value: '' })
    }
  }
  return results
}
