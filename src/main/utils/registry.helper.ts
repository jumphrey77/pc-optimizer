/**
 * registry.helper.ts
 * Pure PowerShell registry access — no native modules required.
 * All functions return plain JS objects/strings.
 */

import { execSync, execFileSync } from 'child_process'
import log from 'electron-log'

export interface RegValue {
  name: string
  type: string
  value: string
}

export interface RegSubkey {
  hive: string
  path: string       // full path e.g. HKLM\Software\...
  name: string       // last segment
}

/**
 * Run a PowerShell command and return trimmed stdout.
 * Throws on non-zero exit.
 */
export function ps(command: string, timeoutMs = 10000): string {
  try {
    return execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
      '-Command', command
    ], { timeout: timeoutMs, encoding: 'utf8' }).trim()
  } catch (e: any) {
    throw new Error(`PowerShell failed: ${e.message}`)
  }
}

/**
 * Run reg.exe query and return raw stdout (faster than PS for big key trees).
 */
export function reg(args: string[], timeoutMs = 15000): string {
  try {
    return execFileSync('reg.exe', args, {
      timeout: timeoutMs, encoding: 'utf8'
    }).trim()
  } catch (e: any) {
    return ''   // reg.exe exits non-zero when key not found — treat as empty
  }
}

/**
 * Query all values under a registry key.
 * Returns an array of { name, type, value }.
 */
export function queryValues(keyPath: string): RegValue[] {
  const raw = reg(['query', keyPath, '/v', '*'])
  return parseRegValues(raw)
}

/**
 * Query all immediate subkeys of a registry key.
 * Returns an array of full key paths.
 */
export function querySubkeys(keyPath: string): string[] {
  const raw = reg(['query', keyPath])
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  // reg query output: first line is the queried key itself, then subkeys, then blank, then values
  return lines
    .filter(l => l.toUpperCase().startsWith('HKEY_') && l !== keyPath.toUpperCase())
    .map(l => l.trim())
}

/**
 * Query values for every subkey of a parent key.
 * Returns a map of subkeyPath → RegValue[]
 */
export function querySubkeyValues(parentKey: string): Map<string, RegValue[]> {
  const result = new Map<string, RegValue[]>()
  const subkeys = querySubkeys(parentKey)
  for (const sk of subkeys) {
    try {
      result.set(sk, queryValues(sk))
    } catch { /* skip inaccessible */ }
  }
  return result
}

/**
 * Delete a specific value from a key.
 * Requires elevation for HKLM writes — call from elevated context.
 */
export function deleteValue(keyPath: string, valueName: string): boolean {
  try {
    reg(['delete', keyPath, '/v', valueName, '/f'])
    return true
  } catch {
    return false
  }
}

/**
 * Delete an entire registry key and all subkeys.
 */
export function deleteKey(keyPath: string): boolean {
  try {
    reg(['delete', keyPath, '/f'])
    return true
  } catch {
    return false
  }
}

/**
 * Export a registry key to a .reg file.
 */
export function exportKey(keyPath: string, destFile: string): boolean {
  try {
    reg(['export', keyPath, destFile, '/y'])
    return true
  } catch {
    return false
  }
}

/**
 * Import a .reg file back into the registry.
 */
export function importFile(regFile: string): boolean {
  try {
    reg(['import', regFile])
    return true
  } catch {
    return false
  }
}

// ─── Internal parser ─────────────────────────────────────────────────────────

/**
 * Parse the output of `reg query /v *` into RegValue[].
 *
 * Each value line looks like:
 *     DisplayName    REG_SZ    Adobe Acrobat Reader
 * The leading whitespace is always 4 spaces.
 */
export function parseRegValues(raw: string): RegValue[] {
  const results: RegValue[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toUpperCase().startsWith('HKEY_')) continue
    // Split on 2+ whitespace to handle spaces in names/values
    const parts = trimmed.split(/\s{2,}/)
    if (parts.length >= 3) {
      results.push({
        name:  parts[0],
        type:  parts[1],
        value: parts.slice(2).join('  ')
      })
    } else if (parts.length === 2) {
      // Value with no data (empty string)
      results.push({ name: parts[0], type: parts[1], value: '' })
    }
  }
  return results
}

/** Convert RegValue[] to a name→value map (lowercased names). */
export function valMap(values: RegValue[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const v of values) m[v.name.toLowerCase()] = v.value
  return m
}
