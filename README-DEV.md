# Dev Setup

## First-time / after clean

Because `concurrently` starts everything at once, the first run
can fail if tsc hasn't emitted `dist/main/index.js` yet before
Electron tries to launch.

**Use this sequence on first run:**

```
# Step 1 - compile main process once
npx tsc -p tsconfig.main.json

# Step 2 - then start everything together
npm run dev
```

After that, `npm run dev` works fine on its own because
`dist/main/index.js` already exists from the previous compile.

## What each process does

| Process       | What it runs                              |
|---------------|-------------------------------------------|
| `dev:vite`    | Vite dev server at http://localhost:5173  |
| `dev:main`    | tsc --watch on src/main + src/preload     |
| `dev:electron`| nodemon watches dist/main, restarts Electron when main recompiles |

## If Electron shows a blank white screen

The Vite dev server wasn't ready when Electron launched.
Just press Ctrl+R inside the Electron window to reload.

## Build for distribution

```
npm run build    # compiles everything to dist/
npm run package  # wraps dist/ into an NSIS installer in release/
```
