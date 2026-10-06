# Rubik's Cube 3x3 Trainer

In-browser 3x3 Rubik's Cube trainer: timer with sessions and WCA scrambles, F2L, OLL and PLL study on a virtual cube, and camera scanning. Everything runs locally in Chrome and the data stays in the browser (IndexedDB).

The interface and the internal docs are in Portuguese (pt-BR).

## Features

### Solo timer (`/solo.html`)

A clean screen just for logging solves.

- **Timer:** hold space until the clock turns green, release to start, press space to stop. While timing, only the clock is on screen. Esc discards the time just saved.
- **Scrambles:** random-state WCA scrambles (cubing.js), a new one after every solve. A button shows the scramble on a virtual cube, move by move, plus the expected net of the six faces.
- **Start position:** white on the bottom, green in front (configured in `app/src/cube-state/orientation.ts`).
- **Sessions:** numbered sessions created only on purpose, each with its creation date. The left sidebar shows the session's times, current and best time, mo3, ao5 and ao12, and a two-click delete.
- **F2L, OLL and PLL:** all 41 F2L, 57 OLL and 21 PLL cases with diagrams. Each case opens on the virtual cube, comes with a scramble to set it up on a real cube and keeps a study status. A practice mode draws cases and reveals the algorithm on demand.
- **Backup:** export (copy or download) and import of all data as structured JSON.

### Trainer (`/`)

Timer with inspection and penalties, history with an evolution chart and csTimer import/export, CFOP solve analysis, a beginner-to-advanced curriculum, an algorithm trainer with spaced repetition, and (experimental) camera scanning and move tracking.

## Getting started

Requirements: Node.js and Google Chrome.

```bash
cd app
npm install
npm run setup   # downloads the MediaPipe model and runtime (needed only for camera tracking)
npm run dev     # http://localhost:5173 (trainer) and http://localhost:5173/solo.html (solo timer)
```

| Command | Description |
|---|---|
| `npm test` | Unit tests (WCA stats, timer, cube model, CFOP stages, OLL/PLL recognition, curriculum algorithms, storage, vision) |
| `npm run e2e:solo` | End-to-end test of the solo timer in headless Chrome |
| `npm run e2e` | End-to-end test of the trainer with a synthetic camera |
| `npm run build` | Strict type-check and production build (both pages) to `app/dist` |

## Feature flags

Camera scanning and move tracking are experimental and only appear locally. `__CAMERA_FEATURES__` (see `app/src/features.ts`) is on in `npm run dev` and off in production builds, where those pages are left out of the bundle. Set `VITE_CAMERA_FEATURES=true` or `false` to override it.

## Deploy (Vercel)

`vercel.json` at the repository root installs and builds `app/` and serves `app/dist`, so importing the GitHub repository in Vercel with the default settings is enough: every push to `main` deploys to production and other branches get preview URLs. The solo timer is at `/solo.html`.

## Repository layout

| Path | Contents |
|---|---|
| [`app/`](app/README.md) | The application: Vite, React and TypeScript |
| [`docs/`](docs/README.md) | Research notes, architecture, backlog and the curriculum data (`docs/curriculum/*.json`) |
| [`spikes/`](spikes/README.md) | Throwaway prototypes used to measure the camera pipeline |

## Built with

[cubing.js](https://github.com/cubing/cubing.js) (scrambles, 3D cube, solver), [Dexie](https://dexie.org) (IndexedDB), [React](https://react.dev), [Vite](https://vite.dev), [OpenCV.js](https://docs.opencv.org) and [MediaPipe](https://ai.google.dev/edge/mediapipe) (camera features).

## License

[MIT](LICENSE)
