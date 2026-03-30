"use strict";
const electron = require("electron");
const path = require("path");
const log = require("electron-log");
const fs = require("fs");
const child_process = require("child_process");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const IPC = {
  SCAN_DISK: "scan:disk",
  SCAN_APPS: "scan:apps",
  SCAN_STARTUP: "scan:startup",
  SCAN_REGISTRY: "scan:registry",
  SCAN_SECURITY: "scan:security",
  GET_DRIVES: "get:drives",
  GET_DISK_TREE: "get:disk-tree",
  GET_APPS: "get:apps",
  GET_STARTUP: "get:startup",
  GET_SECURITY: "get:security",
  FIX_APPLY: "fix:apply",
  FIX_PREVIEW: "fix:preview",
  ROLLBACK_ACTION: "rollback:action",
  ROLLBACK_LIST: "rollback:list",
  RESTORE_POINT: "restore:create",
  ACTION_LOG_GET: "actionlog:get",
  ACTION_LOG_CLEAR: "actionlog:clear",
  OPEN_PATH: "shell:open-path",
  OPEN_URL: "shell:open-url"
};
const KNOWN_CACHE_PATHS = [
  { rel: "AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache", label: "Chrome cache", category: "cache" },
  { rel: "AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache", label: "Edge cache", category: "cache" },
  { rel: "AppData\\Local\\Temp", label: "User temp", category: "cache" },
  { rel: "AppData\\Local\\npm-cache", label: "npm cache", category: "dev" },
  { rel: "AppData\\Local\\pip\\Cache", label: "pip cache", category: "dev" },
  { rel: "AppData\\Roaming\\Code\\logs", label: "VS Code logs", category: "dev" }
];
const GAME_PATHS = [
  "C:\\Program Files (x86)\\Steam",
  "C:\\Program Files\\Epic Games",
  "C:\\Program Files\\EA Games",
  "C:\\XboxGames"
];
async function getDrives() {
  try {
    const ps2 = `Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json`;
    const raw = child_process.execSync(`powershell -NoProfile -Command "${ps2}"`, { timeout: 1e4 }).toString();
    const data = JSON.parse(raw);
    const disks = Array.isArray(data) ? data : [data];
    return disks.map((d) => ({
      letter: d.DeviceID,
      label: d.VolumeName || "Local Disk",
      totalBytes: parseInt(d.Size || "0"),
      freeBytes: parseInt(d.FreeSpace || "0"),
      usedBytes: parseInt(d.Size || "0") - parseInt(d.FreeSpace || "0")
    }));
  } catch (e) {
    log.warn("getDrives fallback", e);
    return [{
      letter: "C:",
      label: "Local Disk",
      totalBytes: 500 * 1024 * 1024 * 1024,
      freeBytes: 120 * 1024 * 1024 * 1024,
      usedBytes: 380 * 1024 * 1024 * 1024
    }];
  }
}
function getDirSize$1(dirPath, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return 0;
  try {
    const entries = fs__namespace.readdirSync(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const full = path__namespace.join(dirPath, entry.name);
      try {
        if (entry.isFile()) {
          total += fs__namespace.statSync(full).size;
        } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
          total += getDirSize$1(full, maxDepth, currentDepth + 1);
        }
      } catch {
      }
    }
    return total;
  } catch {
    return 0;
  }
}
function categorise(fullPath) {
  const lower = fullPath.toLowerCase();
  if (lower.includes("windows") || lower.includes("program files\\common")) return "system";
  if (lower.includes("steam") || lower.includes("epic games") || lower.includes("ea games") || lower.includes("xboxgames")) return "games";
  if (lower.includes("npm") || lower.includes("node_modules") || lower.includes("pip") || lower.includes("code\\extensions")) return "dev";
  if (lower.includes("cache") || lower.includes("temp") || lower.includes("tmp")) return "cache";
  if (lower.includes("pictures") || lower.includes("videos") || lower.includes("music") || lower.includes("photos")) return "media";
  if (lower.includes("users") || lower.includes("documents") || lower.includes("downloads") || lower.includes("desktop")) return "user";
  return "other";
}
async function getDiskTree(rootPath = "C:\\") {
  const results = [];
  try {
    const entries = fs__namespace.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path__namespace.join(rootPath, entry.name);
      try {
        const size = getDirSize$1(full, 2);
        if (size < 1024 * 1024) continue;
        results.push({
          name: entry.name,
          path: full,
          size,
          category: categorise(full)
        });
      } catch {
      }
    }
    results.sort((a, b) => b.size - a.size);
    return results.slice(0, 50);
  } catch (e) {
    log.error("getDiskTree error", e);
    return [];
  }
}
async function scanDisk() {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const findings = [];
  const errors = [];
  try {
    const userProfile = process.env.USERPROFILE || "C:\\Users\\User";
    const winTemp = "C:\\Windows\\Temp";
    const winTempSize = getDirSize$1(winTemp, 1);
    if (winTempSize > 500 * 1024 * 1024) {
      findings.push({
        id: "disk-win-temp",
        module: "disk",
        severity: winTempSize > 2 * 1024 * 1024 * 1024 ? "high" : "medium",
        title: "Windows Temp folder is large",
        description: "The Windows Temp folder contains files that are safe to remove.",
        evidence: [`C:\\Windows\\Temp — ${formatBytes(winTempSize)}`],
        estimatedBytesSaved: winTempSize,
        fixType: "automatic",
        requiresElevation: true,
        rollbackSupported: false,
        rollbackPlan: "Temp files cannot be restored — they are by definition disposable."
      });
    }
    const userTemp = path__namespace.join(userProfile, "AppData\\Local\\Temp");
    const userTempSize = getDirSize$1(userTemp, 1);
    if (userTempSize > 200 * 1024 * 1024) {
      findings.push({
        id: "disk-user-temp",
        module: "disk",
        severity: "low",
        title: "User Temp folder has accumulated files",
        description: "Your personal Temp folder contains files that apps forgot to clean up.",
        evidence: [`${userTemp} — ${formatBytes(userTempSize)}`],
        estimatedBytesSaved: userTempSize,
        fixType: "automatic",
        requiresElevation: false,
        rollbackSupported: false
      });
    }
    for (const cp of KNOWN_CACHE_PATHS) {
      const full = path__namespace.join(userProfile, cp.rel);
      if (!fs__namespace.existsSync(full)) continue;
      const size = getDirSize$1(full, 1);
      if (size > 100 * 1024 * 1024) {
        findings.push({
          id: `disk-cache-${cp.label.replace(/\s/g, "-").toLowerCase()}`,
          module: "disk",
          severity: size > 1024 * 1024 * 1024 ? "high" : "medium",
          title: `${cp.label} is using ${formatBytes(size)}`,
          description: `This cache is safe to clear. The app will rebuild it as needed.`,
          evidence: [full],
          estimatedBytesSaved: size,
          fixType: "automatic",
          requiresElevation: false,
          rollbackSupported: false
        });
      }
    }
    const wslPaths = [
      path__namespace.join(userProfile, "AppData\\Local\\Packages")
    ];
    for (const wslBase of wslPaths) {
      if (!fs__namespace.existsSync(wslBase)) continue;
      try {
        const pkgs = fs__namespace.readdirSync(wslBase);
        for (const pkg of pkgs) {
          if (!pkg.toLowerCase().includes("ubuntu") && !pkg.toLowerCase().includes("debian") && !pkg.toLowerCase().includes("kali")) continue;
          const vhdx = path__namespace.join(wslBase, pkg, "LocalState", "ext4.vhdx");
          if (fs__namespace.existsSync(vhdx)) {
            const size = fs__namespace.statSync(vhdx).size;
            findings.push({
              id: "disk-wsl-vhdx",
              module: "disk",
              severity: size > 20 * 1024 * 1024 * 1024 ? "high" : "medium",
              title: `WSL disk image is ${formatBytes(size)}`,
              description: 'The WSL virtual disk can grow large. You can compact it with "wsl --shutdown" followed by "diskpart" optimize.',
              evidence: [vhdx],
              estimatedBytesSaved: Math.floor(size * 0.3),
              fixType: "guided",
              requiresElevation: true,
              rollbackSupported: false
            });
          }
        }
      } catch {
      }
    }
    const hiberfil = "C:\\hiberfil.sys";
    if (fs__namespace.existsSync(hiberfil)) {
      try {
        const size = fs__namespace.statSync(hiberfil).size;
        if (size > 1024 * 1024 * 1024) {
          findings.push({
            id: "disk-hiberfil",
            module: "disk",
            severity: "low",
            title: `Hibernation file using ${formatBytes(size)}`,
            description: "If you never use hibernation (Sleep is different), this file can be removed by disabling hibernate.",
            evidence: [hiberfil],
            estimatedBytesSaved: size,
            fixType: "guided",
            requiresElevation: true,
            rollbackSupported: true,
            rollbackPlan: 'Re-enable hibernation with "powercfg /hibernate on" to recreate the file.'
          });
        }
      } catch {
      }
    }
    for (const gp of GAME_PATHS) {
      if (!fs__namespace.existsSync(gp)) continue;
      const size = getDirSize$1(gp, 2);
      if (size > 10 * 1024 * 1024 * 1024) {
        findings.push({
          id: `disk-games-${path__namespace.basename(gp).replace(/\s/g, "-").toLowerCase()}`,
          module: "disk",
          severity: size > 50 * 1024 * 1024 * 1024 ? "high" : "medium",
          title: `${path__namespace.basename(gp)} library on C: — ${formatBytes(size)}`,
          description: "Game libraries are large and are good candidates to move to a secondary drive (D:).",
          evidence: [gp],
          estimatedBytesSaved: size,
          fixType: "guided",
          requiresElevation: false,
          rollbackSupported: true,
          rollbackPlan: "Change the library path back in the launcher settings."
        });
      }
    }
  } catch (e) {
    errors.push(e.message);
    log.error("scanDisk error", e);
  }
  return {
    module: "disk",
    startedAt,
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    findings,
    errors
  };
}
function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
function registerDiskIpc() {
  electron.ipcMain.handle(IPC.GET_DRIVES, () => getDrives());
  electron.ipcMain.handle(IPC.GET_DISK_TREE, (_, p) => getDiskTree(p));
  electron.ipcMain.handle(IPC.SCAN_DISK, () => scanDisk());
}
function reg(args, timeoutMs = 15e3) {
  try {
    return child_process.execFileSync("reg.exe", args, {
      timeout: timeoutMs,
      encoding: "utf8"
    }).trim();
  } catch (e) {
    return "";
  }
}
function queryValues(keyPath) {
  const raw = reg(["query", keyPath, "/v", "*"]);
  return parseRegValues(raw);
}
function querySubkeys(keyPath) {
  const raw = reg(["query", keyPath]);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => l.toUpperCase().startsWith("HKEY_") && l !== keyPath.toUpperCase()).map((l) => l.trim());
}
function querySubkeyValues(parentKey) {
  const result = /* @__PURE__ */ new Map();
  const subkeys = querySubkeys(parentKey);
  for (const sk of subkeys) {
    try {
      result.set(sk, queryValues(sk));
    } catch {
    }
  }
  return result;
}
function exportKey(keyPath, destFile) {
  try {
    reg(["export", keyPath, destFile, "/y"]);
    return true;
  } catch {
    return false;
  }
}
function parseRegValues(raw) {
  const results = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toUpperCase().startsWith("HKEY_")) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 3) {
      results.push({
        name: parts[0],
        type: parts[1],
        value: parts.slice(2).join("  ")
      });
    } else if (parts.length === 2) {
      results.push({ name: parts[0], type: parts[1], value: "" });
    }
  }
  return results;
}
function valMap(values) {
  const m = {};
  for (const v of values) m[v.name.toLowerCase()] = v.value;
  return m;
}
const BLOATWARE_PATTERNS = [
  /mcafee/i,
  /norton/i,
  /avast\s+(?!cleanup)/i,
  /avg\s+/i,
  /cyberlink/i,
  /candy\s+crush/i,
  /bubble\s+witch/i,
  /farmville/i,
  /myasus/i,
  /hp\s+jumpstart/i,
  /dell\s+supportassist\s+os/i,
  /lenovo\s+vantage/i,
  /asus\s+gift\s+box/i,
  /amazon\s+assistant/i,
  /booking\.com/i,
  /trivago/i,
  /priceline/i,
  /wildtangent/i,
  /microsoft\s+bing\s+health/i,
  /netflix.*(?:app|for\s+windows)/i
];
const RUNTIME_PATTERNS = [
  { pattern: /microsoft\s+\.net\s+\d/i, type: "dotnet" },
  { pattern: /microsoft\s+visual\s+c\+\+\s+\d/i, type: "vcredist" },
  { pattern: /java\s+(se\s+)?runtime/i, type: "java" },
  { pattern: /java\s+\d+\s+(update|\()/i, type: "java" }
];
const UNINSTALL_KEYS = [
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
];
async function getInstalledApps() {
  const apps = [];
  const seen = /* @__PURE__ */ new Set();
  for (const parentKey of UNINSTALL_KEYS) {
    try {
      const subkeys = querySubkeyValues(parentKey);
      for (const [subkeyPath, values] of subkeys) {
        const m = valMap(values);
        const name = m["displayname"]?.trim();
        if (!name) continue;
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        if (m["systemcomponent"] === "1") continue;
        if (m["releasetype"] === "Security Update" || m["releasetype"] === "Update") continue;
        if (m["parentkeyname"]) continue;
        const uninstallStr = m["uninstallstring"] || "";
        const sizeKb = parseInt(m["estimatedsize"] || "0");
        let isBrokenInstall = false;
        if (uninstallStr) {
          const exePath = extractExe$2(uninstallStr);
          isBrokenInstall = !!exePath && exePath.endsWith(".exe") && !fs__namespace.existsSync(exePath);
        }
        const isBloatware = BLOATWARE_PATTERNS.some((p) => p.test(name));
        let runtimeType = null;
        for (const { pattern, type } of RUNTIME_PATTERNS) {
          if (pattern.test(name)) {
            runtimeType = type;
            break;
          }
        }
        apps.push({
          id: subkeyPath,
          name,
          publisher: m["publisher"] || void 0,
          version: m["displayversion"] || void 0,
          installDate: m["installdate"] || void 0,
          installLocation: m["installlocation"] || void 0,
          estimatedSize: sizeKb ? sizeKb * 1024 : void 0,
          uninstallString: uninstallStr || void 0,
          isBloatware,
          isBrokenInstall,
          runtimeType,
          startupImpact: "none"
        });
      }
    } catch (e) {
      log.warn(`getInstalledApps key error: ${parentKey}`, e);
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
async function scanApps() {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const findings = [];
  const errors = [];
  try {
    const apps = await getInstalledApps();
    for (const app of apps.filter((a) => a.isBloatware)) {
      findings.push({
        id: `app-bloat-${slug(app.id)}`,
        module: "apps",
        severity: "low",
        title: `Potential bloatware: ${app.name}`,
        description: "Commonly pre-installed by OEMs or bundled with hardware.",
        evidence: [app.name, app.publisher || "Unknown publisher"],
        fixType: "guided",
        requiresElevation: false,
        rollbackSupported: false
      });
    }
    for (const app of apps.filter((a) => a.isBrokenInstall)) {
      findings.push({
        id: `app-broken-${slug(app.id)}`,
        module: "apps",
        severity: "medium",
        title: `Broken uninstall entry: ${app.name}`,
        description: "Uninstall entry points to an executable that no longer exists.",
        evidence: [app.uninstallString || "No uninstall string"],
        fixType: "automatic",
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: "Registry key exported as .reg before removal."
      });
    }
    const runtimesByType = {};
    for (const app of apps.filter((a) => a.runtimeType)) {
      const k = app.runtimeType;
      if (!runtimesByType[k]) runtimesByType[k] = [];
      runtimesByType[k].push(app);
    }
    for (const [type, rApps] of Object.entries(runtimesByType)) {
      if (rApps.length > 4) {
        const label = type === "dotnet" ? ".NET" : type === "vcredist" ? "VC++ Redistributable" : "Java";
        findings.push({
          id: `app-runtime-${type}`,
          module: "apps",
          severity: "info",
          title: `${rApps.length} versions of ${label} installed`,
          description: "Multiple runtime versions are normal. Review before removing any.",
          evidence: rApps.map((a) => a.name),
          fixType: "manual",
          requiresElevation: false,
          rollbackSupported: false
        });
      }
    }
    const pdfReaders = apps.filter((a) => /pdf/i.test(a.name) && /(reader|viewer|editor)/i.test(a.name));
    if (pdfReaders.length > 1) {
      findings.push({
        id: "app-dup-pdf",
        module: "apps",
        severity: "low",
        title: `${pdfReaders.length} PDF readers installed`,
        description: "Consider keeping only one.",
        evidence: pdfReaders.map((a) => a.name),
        fixType: "manual",
        requiresElevation: false,
        rollbackSupported: false
      });
    }
  } catch (e) {
    errors.push(e.message);
    log.error("scanApps error", e);
  }
  return { module: "apps", startedAt, completedAt: (/* @__PURE__ */ new Date()).toISOString(), findings, errors };
}
function extractExe$2(s) {
  const q = s.match(/^"([^"]+)"/);
  if (q) return q[1];
  const sp = s.indexOf(" ");
  return sp > 0 ? s.slice(0, sp) : s;
}
function slug(s) {
  return s.slice(-12).replace(/[^a-z0-9]/gi, "-").toLowerCase();
}
const STARTUP_REG_KEYS = [
  { key: "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", label: "HKLM\\Run" },
  { key: "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run", label: "HKLM\\Run (32-bit)" },
  { key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", label: "HKCU\\Run" }
];
const STARTUP_FOLDERS = [
  path__namespace.join(process.env.ALLUSERSPROFILE || "C:\\ProgramData", "Microsoft\\Windows\\Start Menu\\Programs\\StartUp"),
  path__namespace.join(process.env.APPDATA || "", "Microsoft\\Windows\\Start Menu\\Programs\\Startup")
];
const MS_TOKENS = ["microsoft", "windows", "explorer", "ctfmon", "svchost", "onedrive", "teams", "msedge"];
const SUSPICIOUS_PATTERNS = [
  /\\temp\\/i,
  /\\appdata\\local\\temp\\/i,
  /\.vbs$/i,
  /\.bat$/i,
  /\.cmd$/i,
  /powershell.*-enc/i,
  /powershell.*hidden/i
];
function extractExe$1(cmd) {
  const q = cmd.match(/^"([^"]+)"/);
  if (q) return q[1];
  return cmd.split(" ")[0];
}
function getTrust(cmd, name) {
  if (SUSPICIOUS_PATTERNS.some((p) => p.test(cmd))) return "suspicious";
  const lower = (cmd + name).toLowerCase();
  if (MS_TOKENS.some((t) => lower.includes(t))) return "microsoft";
  const exePath = extractExe$1(cmd);
  if (fs__namespace.existsSync(exePath)) {
    const pf = (process.env["ProgramFiles"] || "C:\\Program Files").toLowerCase();
    const pf86 = (process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)").toLowerCase();
    if (exePath.toLowerCase().startsWith(pf) || exePath.toLowerCase().startsWith(pf86)) return "verified";
  }
  return "unknown";
}
async function getRegistryStartupEntries() {
  const entries = [];
  for (const { key, label } of STARTUP_REG_KEYS) {
    try {
      const values = queryValues(key);
      for (const v of values) {
        const cmd = v.value;
        const exePath = extractExe$1(cmd);
        entries.push({
          id: `reg-${key}-${v.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
          name: v.name,
          command: cmd,
          location: label,
          trust: getTrust(cmd, v.name),
          enabled: true,
          pathExists: fs__namespace.existsSync(exePath),
          impact: "medium"
        });
      }
    } catch (e) {
      log.warn(`startup reg scan error: ${label}`, e);
    }
  }
  return entries;
}
function getFolderStartupEntries() {
  const entries = [];
  for (const folder of STARTUP_FOLDERS) {
    if (!fs__namespace.existsSync(folder)) continue;
    try {
      for (const file of fs__namespace.readdirSync(folder)) {
        const full = path__namespace.join(folder, file);
        entries.push({
          id: `folder-${full.replace(/[^a-z0-9]/gi, "-")}`,
          name: file.replace(/\.[^.]+$/, ""),
          command: full,
          location: folder,
          trust: getTrust(full, file),
          enabled: true,
          pathExists: fs__namespace.existsSync(full),
          impact: "low"
        });
      }
    } catch {
    }
  }
  return entries;
}
async function getStartupEntries() {
  const [reg2, folder] = await Promise.all([
    getRegistryStartupEntries(),
    Promise.resolve(getFolderStartupEntries())
  ]);
  return [...reg2, ...folder];
}
async function scanStartup() {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const findings = [];
  const errors = [];
  try {
    const entries = await getStartupEntries();
    for (const e of entries.filter((e2) => !e2.pathExists && e2.enabled)) {
      findings.push({
        id: `startup-missing-${e.id}`,
        module: "startup",
        severity: "medium",
        title: `Startup entry points to missing file: ${e.name}`,
        description: "References a file that no longer exists. Safe to remove.",
        evidence: [e.command, e.location],
        fixType: "automatic",
        requiresElevation: e.location.includes("HKLM"),
        rollbackSupported: true,
        rollbackPlan: "Registry key or shortcut backed up before removal."
      });
    }
    for (const e of entries.filter((e2) => e2.trust === "suspicious")) {
      findings.push({
        id: `startup-sus-${e.id}`,
        module: "startup",
        severity: "high",
        title: `Suspicious startup entry: ${e.name}`,
        description: "Has characteristics associated with malicious software. Review carefully.",
        evidence: [e.command, e.location],
        fixType: "guided",
        requiresElevation: e.location.includes("HKLM"),
        rollbackSupported: true,
        rollbackPlan: "Entry backed up before any action."
      });
    }
    const unknownCount = entries.filter((e) => e.trust === "unknown" && e.pathExists).length;
    if (unknownCount > 5) {
      findings.push({
        id: "startup-many-unknown",
        module: "startup",
        severity: "info",
        title: `${unknownCount} unknown startup programs`,
        description: "Many startup items from unverified publishers. Review each.",
        evidence: entries.filter((e) => e.trust === "unknown" && e.pathExists).map((e) => e.name),
        fixType: "manual",
        requiresElevation: false,
        rollbackSupported: false
      });
    }
  } catch (e) {
    errors.push(e.message);
    log.error("scanStartup error", e);
  }
  return { module: "startup", startedAt, completedAt: (/* @__PURE__ */ new Date()).toISOString(), findings, errors };
}
function extractExe(s) {
  const q = s.match(/^"([^"]+)"/);
  if (q) return q[1];
  const sp = s.indexOf(" ");
  return sp > 0 ? s.slice(0, sp) : s;
}
function checkRunKeys() {
  const findings = [];
  const RUN_KEYS = [
    { key: "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", hive: "HKLM" },
    { key: "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce", hive: "HKLM" },
    { key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", hive: "HKCU" }
  ];
  for (const { key, hive } of RUN_KEYS) {
    try {
      const values = queryValues(key);
      for (const v of values) {
        const exePath = extractExe(v.value);
        if (!exePath) continue;
        if (!fs__namespace.existsSync(exePath)) {
          findings.push({
            id: `reg-run-missing-${hive}-${v.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
            module: "registry",
            severity: "medium",
            title: `Run key points to missing file: ${v.name}`,
            description: `Startup entry references "${exePath}" which no longer exists.`,
            evidence: [`${key}`, `${v.name} = ${v.value}`],
            fixType: "automatic",
            requiresElevation: hive === "HKLM",
            rollbackSupported: true,
            rollbackPlan: "Registry value exported as .reg backup before deletion."
          });
        }
      }
    } catch {
    }
  }
  return findings;
}
function checkUninstallEntries() {
  const findings = [];
  const UNINSTALL_KEYS2 = [
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
  ];
  for (const parentKey of UNINSTALL_KEYS2) {
    try {
      const subkeys = querySubkeyValues(parentKey);
      for (const [subkeyPath, values] of subkeys) {
        const m = valMap(values);
        const name = m["displayname"];
        if (!name) continue;
        const uninstall = m["uninstallstring"];
        if (!uninstall) {
          findings.push({
            id: `reg-uninstall-nostr-${subkeyPath.slice(-16).replace(/[^a-z0-9]/gi, "-")}`,
            module: "registry",
            severity: "low",
            title: `Orphaned uninstall entry: ${name}`,
            description: "App appears in Programs & Features but has no uninstall command.",
            evidence: [subkeyPath, name],
            fixType: "automatic",
            requiresElevation: true,
            rollbackSupported: true,
            rollbackPlan: "Registry key exported as .reg before removal."
          });
        } else {
          const exePath = extractExe(uninstall);
          if (exePath && exePath.endsWith(".exe") && !fs__namespace.existsSync(exePath)) {
            findings.push({
              id: `reg-uninstall-broken-${subkeyPath.slice(-16).replace(/[^a-z0-9]/gi, "-")}`,
              module: "registry",
              severity: "medium",
              title: `Broken uninstaller: ${name}`,
              description: `Uninstaller executable for "${name}" no longer exists.`,
              evidence: [uninstall, exePath],
              fixType: "automatic",
              requiresElevation: true,
              rollbackSupported: true,
              rollbackPlan: "Registry key exported as .reg before removal."
            });
          }
        }
      }
    } catch {
    }
  }
  return findings;
}
function checkFileAssociations() {
  const findings = [];
  try {
    const subkeys = querySubkeyValues("HKCU\\Software\\Classes");
    let brokenCount = 0;
    const brokenNames = [];
    let checked = 0;
    for (const [skPath] of subkeys) {
      if (checked++ > 80) break;
      const ext = skPath.split("\\").pop() || "";
      if (!ext.startsWith(".")) continue;
      try {
        const cmdValues = queryValues(`${skPath}\\shell\\open\\command`);
        if (cmdValues.length > 0) {
          const exePath = extractExe(cmdValues[0].value);
          if (exePath && exePath.endsWith(".exe") && !fs__namespace.existsSync(exePath)) {
            brokenCount++;
            brokenNames.push(`${ext} → ${exePath}`);
          }
        }
      } catch {
      }
    }
    if (brokenCount > 0) {
      findings.push({
        id: "reg-broken-associations",
        module: "registry",
        severity: brokenCount > 5 ? "medium" : "low",
        title: `${brokenCount} broken file associations`,
        description: "File types with handlers pointing to apps no longer installed.",
        evidence: brokenNames.slice(0, 10),
        fixType: "guided",
        requiresElevation: false,
        rollbackSupported: true,
        rollbackPlan: "Affected keys exported as .reg before changes."
      });
    }
  } catch {
  }
  return findings;
}
async function scanRegistry() {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const errors = [];
  let findings = [];
  try {
    findings = [
      ...checkRunKeys(),
      ...checkUninstallEntries(),
      ...checkFileAssociations()
    ];
  } catch (e) {
    errors.push(e.message);
    log.error("scanRegistry error", e);
  }
  return { module: "registry", startedAt, completedAt: (/* @__PURE__ */ new Date()).toISOString(), findings, errors };
}
function ps(command) {
  try {
    return child_process.execSync(`powershell -NoProfile -Command "${command}"`, { timeout: 8e3 }).toString().trim();
  } catch {
    return "";
  }
}
async function getSecurityStatus() {
  const defenderStatus = ps(`(Get-MpComputerStatus).AntivirusEnabled`);
  const defenderScan = ps(`(Get-MpComputerStatus).QuickScanEndTime`);
  const firewallDomain = ps(`(Get-NetFirewallProfile -Profile Domain).Enabled`);
  const uacLevel = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA`);
  const pendingUpdates = ps(`(Get-WUList -NotInstalled 2>$null | Measure-Object).Count`);
  const guestAccount = ps(`(Get-LocalUser -Name 'Guest' 2>$null).Enabled`);
  const autorun = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -ErrorAction SilentlyContinue).NoDriveTypeAutoRun`);
  return {
    defenderEnabled: defenderStatus.toLowerCase() === "true",
    defenderLastScan: defenderScan || void 0,
    firewallEnabled: firewallDomain.toLowerCase() === "true",
    uacEnabled: uacLevel === "1",
    windowsUpdatePending: parseInt(pendingUpdates) || 0,
    guestAccountEnabled: guestAccount.toLowerCase() === "true",
    autorunEnabled: autorun === "" || autorun === "0"
  };
}
async function scanSecurity() {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const findings = [];
  const errors = [];
  try {
    const status = await getSecurityStatus();
    if (!status.defenderEnabled) {
      findings.push({
        id: "sec-defender-off",
        module: "security",
        severity: "critical",
        title: "Windows Defender is disabled",
        description: "Real-time antivirus protection is off. This leaves your PC vulnerable to malware.",
        evidence: ["Windows Defender: Disabled"],
        fixType: "guided",
        requiresElevation: true,
        rollbackSupported: false,
        helpUrl: "https://support.microsoft.com/en-us/windows/turn-on-microsoft-defender-antivirus"
      });
    }
    if (!status.firewallEnabled) {
      findings.push({
        id: "sec-firewall-off",
        module: "security",
        severity: "high",
        title: "Windows Firewall is disabled",
        description: "The Windows Firewall helps block unauthorised network connections.",
        evidence: ["Firewall (Domain profile): Disabled"],
        fixType: "guided",
        requiresElevation: true,
        rollbackSupported: false
      });
    }
    if (!status.uacEnabled) {
      findings.push({
        id: "sec-uac-off",
        module: "security",
        severity: "high",
        title: "User Account Control (UAC) is disabled",
        description: "UAC prevents apps from making admin-level changes without your knowledge.",
        evidence: ["EnableLUA = 0"],
        fixType: "guided",
        requiresElevation: true,
        rollbackSupported: false
      });
    }
    if (status.windowsUpdatePending > 0) {
      findings.push({
        id: "sec-pending-updates",
        module: "security",
        severity: status.windowsUpdatePending > 5 ? "high" : "medium",
        title: `${status.windowsUpdatePending} Windows updates pending`,
        description: "Pending updates may include important security patches.",
        evidence: [`${status.windowsUpdatePending} updates available`],
        fixType: "guided",
        requiresElevation: false,
        rollbackSupported: false
      });
    }
    if (status.guestAccountEnabled) {
      findings.push({
        id: "sec-guest-enabled",
        module: "security",
        severity: "medium",
        title: "Guest account is enabled",
        description: "The Windows Guest account allows anyone to log in without a password.",
        evidence: ["Guest account: Enabled"],
        fixType: "automatic",
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: "Guest account can be re-enabled from User Accounts in Control Panel."
      });
    }
    if (status.autorunEnabled) {
      findings.push({
        id: "sec-autorun-enabled",
        module: "security",
        severity: "low",
        title: "AutoRun is enabled for removable drives",
        description: "AutoRun can automatically execute files when USB drives or discs are inserted.",
        evidence: ["NoDriveTypeAutoRun policy not set"],
        fixType: "automatic",
        requiresElevation: true,
        rollbackSupported: true,
        rollbackPlan: "AutoRun policy key will be backed up before change."
      });
    }
  } catch (e) {
    errors.push(e.message);
    log.error("scanSecurity error", e);
  }
  return {
    module: "security",
    startedAt,
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    findings,
    errors
  };
}
const DATA_DIR = path__namespace.join(electron.app.getPath("userData"), "rollback");
const ACTION_LOG_FILE = path__namespace.join(electron.app.getPath("userData"), "action-log.json");
path__namespace.join(DATA_DIR, "registry");
function createRestorePoint(description) {
  try {
    const ps2 = `Checkpoint-Computer -Description "${description}" -RestorePointType "MODIFY_SETTINGS"`;
    child_process.execSync(`powershell -NoProfile -Command "${ps2}"`, { timeout: 3e4 });
    log.info(`Restore point created: ${description}`);
    return true;
  } catch (e) {
    log.warn("createRestorePoint failed (may need elevation or be rate-limited)", e);
    return false;
  }
}
function importRegistryFile(filePath) {
  try {
    child_process.execSync(`reg import "${filePath}"`, { timeout: 1e4 });
    log.info(`Registry restored from: ${filePath}`);
    return true;
  } catch (e) {
    log.error("importRegistryFile failed", e);
    return false;
  }
}
function readActionLog() {
  try {
    if (!fs__namespace.existsSync(ACTION_LOG_FILE)) return [];
    return JSON.parse(fs__namespace.readFileSync(ACTION_LOG_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function appendActionLog(findingId, findingTitle, action, outcome, detail, rollbackData) {
  const log_entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    findingId,
    findingTitle,
    action,
    outcome,
    detail,
    ...rollbackData ? { rollbackData } : {}
  };
  const existing = readActionLog();
  existing.unshift(log_entry);
  try {
    fs__namespace.writeFileSync(ACTION_LOG_FILE, JSON.stringify(existing.slice(0, 200), null, 2));
  } catch (e) {
    log.error("appendActionLog write failed", e);
  }
  return log_entry;
}
function clearActionLog() {
  try {
    fs__namespace.writeFileSync(ACTION_LOG_FILE, "[]");
  } catch {
  }
}
function getRollbackList() {
  try {
    if (!fs__namespace.existsSync(ACTION_LOG_FILE)) return [];
    const all = JSON.parse(fs__namespace.readFileSync(ACTION_LOG_FILE, "utf-8"));
    return all.filter((e) => e.action === "fix" && e.outcome === "success" && e.rollbackData);
  } catch {
    return [];
  }
}
function clearDirectory(dirPath, findingId, findingTitle) {
  try {
    if (!fs__namespace.existsSync(dirPath)) return { success: false, error: "Path no longer exists" };
    const sizeBefore = getDirSize(dirPath);
    const entries = fs__namespace.readdirSync(dirPath);
    let deleted = 0;
    for (const entry of entries) {
      try {
        fs__namespace.rmSync(path__namespace.join(dirPath, entry), { recursive: true, force: true });
        deleted++;
      } catch {
      }
    }
    appendActionLog(findingId, findingTitle, "fix", "success", `Cleared ${deleted} items from ${dirPath}`);
    return { success: true, bytesSaved: sizeBefore };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
function fixDisableGuestAccount(findingId, findingTitle) {
  try {
    child_process.execFileSync("net.exe", ["user", "Guest", "/active:no"], { timeout: 1e4 });
    appendActionLog(findingId, findingTitle, "fix", "success", "Disabled Guest account");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
function fixDisableAutorun(findingId, findingTitle) {
  try {
    const keyPath = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer";
    const backupFile = path__namespace.join(
      process.env.APPDATA || "",
      `pc-optimizer\\rollback\\autorun_${Date.now()}.reg`
    );
    fs__namespace.mkdirSync(path__namespace.dirname(backupFile), { recursive: true });
    exportKey(keyPath, backupFile);
    child_process.execFileSync("reg.exe", [
      "add",
      keyPath,
      "/v",
      "NoDriveTypeAutoRun",
      "/t",
      "REG_DWORD",
      "/d",
      "255",
      "/f"
    ], { timeout: 1e4 });
    appendActionLog(
      findingId,
      findingTitle,
      "fix",
      "success",
      "Disabled AutoRun for all drive types",
      { type: "registry", regFile: backupFile }
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
async function applyFix(findingId, findingTitle) {
  log.info(`applyFix: ${findingId}`);
  const userProfile = process.env.USERPROFILE || "C:\\Users\\User";
  if (findingId === "disk-win-temp")
    return clearDirectory("C:\\Windows\\Temp", findingId, findingTitle);
  if (findingId === "disk-user-temp")
    return clearDirectory(path__namespace.join(userProfile, "AppData\\Local\\Temp"), findingId, findingTitle);
  if (findingId === "sec-guest-enabled")
    return fixDisableGuestAccount(findingId, findingTitle);
  if (findingId === "sec-autorun-enabled")
    return fixDisableAutorun(findingId, findingTitle);
  if (findingId.startsWith("reg-run-missing-"))
    return { success: false, error: "Re-scan to identify exact registry key before removing." };
  if (findingId.startsWith("reg-uninstall-"))
    return { success: false, error: "Re-scan to identify exact registry key before removing." };
  return { success: false, error: `No fix handler registered for: ${findingId}` };
}
function getDirSize(dir, depth = 0) {
  if (depth > 2) return 0;
  try {
    return fs__namespace.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
      const full = path__namespace.join(dir, e.name);
      try {
        if (e.isFile()) return acc + fs__namespace.statSync(full).size;
        if (e.isDirectory() && !e.isSymbolicLink()) return acc + getDirSize(full, depth + 1);
      } catch {
      }
      return acc;
    }, 0);
  } catch {
    return 0;
  }
}
function registerAppsIpc() {
  electron.ipcMain.handle(IPC.GET_APPS, () => getInstalledApps());
  electron.ipcMain.handle(IPC.SCAN_APPS, () => scanApps());
}
function registerStartupIpc() {
  electron.ipcMain.handle(IPC.GET_STARTUP, () => getStartupEntries());
  electron.ipcMain.handle(IPC.SCAN_STARTUP, () => scanStartup());
}
function registerRegistryIpc() {
  electron.ipcMain.handle(IPC.SCAN_REGISTRY, () => scanRegistry());
}
function registerSecurityIpc() {
  electron.ipcMain.handle(IPC.GET_SECURITY, () => getSecurityStatus());
  electron.ipcMain.handle(IPC.SCAN_SECURITY, () => scanSecurity());
}
function registerRollbackIpc() {
  electron.ipcMain.handle(IPC.RESTORE_POINT, (_, desc) => createRestorePoint(desc));
  electron.ipcMain.handle(IPC.ACTION_LOG_GET, () => readActionLog());
  electron.ipcMain.handle(IPC.ACTION_LOG_CLEAR, () => clearActionLog());
  electron.ipcMain.handle(IPC.ROLLBACK_LIST, () => getRollbackList());
  electron.ipcMain.handle(IPC.ROLLBACK_ACTION, (_, logId) => {
    const list = getRollbackList();
    const entry = list.find((e) => e.id === logId);
    if (!entry?.rollbackData) return { success: false, error: "No rollback data found" };
    const { type, regFile } = entry.rollbackData;
    if (type === "registry" && regFile) {
      const ok = importRegistryFile(regFile);
      if (ok) {
        appendActionLog(entry.findingId, entry.findingTitle, "rollback", "success", `Rolled back from ${regFile}`);
        return { success: true };
      }
      return { success: false, error: "Registry import failed" };
    }
    return { success: false, error: "Unknown rollback type" };
  });
  electron.ipcMain.handle(IPC.FIX_APPLY, (_, findingId, findingTitle) => {
    return applyFix(findingId, findingTitle ?? findingId);
  });
  electron.ipcMain.handle(IPC.FIX_PREVIEW, (_, findingId) => {
    return { findingId, preview: "Fix preview not yet implemented for this finding type." };
  });
}
log.initialize();
log.info("PC Optimizer starting up");
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0f1117",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0f1117",
      symbolColor: "#94a3b8",
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  registerDiskIpc();
  registerAppsIpc();
  registerStartupIpc();
  registerRegistryIpc();
  registerSecurityIpc();
  registerRollbackIpc();
  electron.ipcMain.handle(IPC.OPEN_PATH, (_, path2) => electron.shell.openPath(path2));
  electron.ipcMain.handle(IPC.OPEN_URL, (_, url) => electron.shell.openExternal(url));
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
