# PC Optimizer

A safe, conservative PC diagnostic and optimization tool built with Electron + React + TypeScript.

## Features

- **Disk Intelligence** — drive usage, treemap visualization, cache cleanup, WSL/Docker disk detection
- **App Audit** — installed apps, bloatware detection, broken install entries, runtime classifiers
- **Startup & Boot** — startup entries with trust scoring, missing path detection, Task Scheduler scan
- **Registry Health** — conservative checks only: broken run keys, orphaned uninstall entries, bad file associations
- **Security Check** — Defender, firewall, UAC, pending updates, guest account, AutoRun
- **Safety Center** — restore points, .reg backups, rollback queue, append-only action log

## Requirements

- Windows 10 / 11
- Node.js 18+
- VS Code (recommended)

## Setup

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build

# Package to installer (.exe)
npm run package
```

## Project structure

```
src/
├── main/                    ← Electron main process (Node.js)
│   ├── index.ts             ← App entry, window creation
│   ├── ipc/                 ← IPC handler registration
│   ├── scanners/            ← System scanning logic
│   │   ├── disk.scanner.ts
│   │   ├── apps.scanner.ts
│   │   ├── startup.scanner.ts
│   │   ├── registry.scanner.ts
│   │   └── security.scanner.ts
│   ├── fixers/              ← Fix execution (extend here)
│   └── rollback/            ← Restore points, .reg backups, action log
│
├── preload/
│   └── index.ts             ← contextBridge API (never nodeIntegration)
│
├── renderer/                ← React + TypeScript UI
│   ├── App.tsx
│   ├── store/useStore.ts    ← Zustand state
│   ├── hooks/useScan.ts
│   ├── components/          ← FindingCard, DiskTreemap, Sidebar, etc.
│   └── pages/               ← One file per module
│
└── shared/
    └── types.ts             ← Shared types + IPC channel constants
```

## Architecture principles

- **contextBridge only** — renderer never touches Node APIs directly
- **IPC channel map** — single source of truth in `shared/types.ts`
- **Safety first** — rollback engine ships before any fix feature runs
- **Conservative registry** — only broken references flagged, no broad cleaning
- **Elevation on demand** — standard user by default; elevated helper spawned only when a fix needs it

## Adding a new scanner

1. Create `src/main/scanners/yourmodule.scanner.ts`
2. Export `scanYourModule(): Promise<ScanResult>`
3. Add IPC handler in `src/main/ipc/`
4. Register in `src/main/index.ts`
5. Add channel to `IPC` map in `src/shared/types.ts`
6. Add `window.api` method in `src/preload/index.ts`
7. Create page in `src/renderer/pages/`
8. Add nav item in `src/renderer/components/Sidebar.tsx`

## Adding a fix

Fixes live in `src/main/fixers/`. The pattern:

```typescript
export async function applyFix(findingId: string): Promise<{ success: boolean; error?: string }> {
  // 1. Export backup (.reg file or file copy)
  // 2. Append to action log with rollbackData
  // 3. Apply the change
  // 4. Return result
}
```

The `FIX_APPLY` IPC handler in `apps.ipc.ts` routes to the correct fixer by finding prefix.

## Notes on elevation

The app runs as a standard user. Admin-required operations (HKLM registry writes, service changes, restore points) are handled via a separate elevated process. For v1, this uses the `runas` npm package. For production, replace with a compiled helper `.exe` with a UAC manifest.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Electron (latest) |
| Frontend | React 18 + TypeScript |
| Build | electron-vite + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Charts | Recharts (treemap, bar) |
| Registry | winreg |
| Services | node-windows |
| WMI | PowerShell child_process |
| Logging | electron-log |
| Packaging | electron-builder → NSIS |
