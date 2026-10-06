# 06 — Arquitetura proposta

## Stack

| Camada | Escolha |
|---|---|
| App | Vite + React + TypeScript (SPA local, roda no Chrome) |
| Cubo 3D / notação / estado / scramble | cubing.js (`twisty`, `alg`, `kpuzzle`, `scramble`) |
| Solver | `cubing/search` (Kociemba, já roda em worker) |
| Preferências | `localStorage` (inspeção, tempo de segurar, sessão atual) |
| Visão | `getUserMedia` + `requestVideoFrameCallback`. OpenCV.js, MediaPipe Hand Landmarker e ONNX Runtime Web (WebGPU) rodam em Web Workers, com frames enviados como `VideoFrame`/`ImageBitmap` transferíveis |
| Persistência | Dexie (IndexedDB). Vídeos ficam no OPFS |
| Gráficos | SVG próprio (`app/src/ui/EvolutionChart.tsx`), com a paleta validada para modo claro e escuro |

## Módulos (implementados em `app/src/`)

```
camera/       captura, constraints (exposição/WB), FrameLoop (requestVideoFrameCallback)
vision/       cor (Lab, ΔE), classificador por posição + rejeição "?", votação, calibração compartilhada,
              GuideSampler / PointSampler, localizador de face (OpenCV, worker), máscara de mãos (MediaPipe, worker),
              atribuição 9-por-cor (húngaro), planificação → estado → KPattern (cubeNet)
tracking/     modelo de adesivos por permutação, FaceObserver (observações estáveis), MoveDecoder (feixe),
              finish/solveGap (estado final conhecido), decodificação de vídeo gravado, métricas
cube-state/   wrapper do KPuzzle e scrambles (cubing.js)
analysis/     modelo de adesivos com rotações/fatias (FaceletCube), etapas CFOP, casos de OLL/PLL, diagnósticos
renderer/     <twisty-player> (CubeView)
timer/        máquina de estados (idle → inspecting → armed → ready → running → stopped | cancelled) + hook de teclado
stats/        médias WCA, formatação
storage/      Dexie: sessions, solves, progress, algStats, trackingRuns; export/import csTimer
curriculum/   leitura de docs/curriculum/*.json, perfil de casos (validação dos algoritmos)
trainer/      repetição espaçada (Leitner) e scramble de caso
ui/           Timer, Histórico (+ Análise, O que treinar), Currículo, Treino, Câmera, Rastreamento
```

## Fluxo de dados

```
Webcam ──frames──▶ vision (worker) ──adesivos+confiança──▶ tracking ──giros──▶ cube-state ──▶ renderer (3D)
                                                               │
Timer (teclado) ─────────── início/fim/penalidade ──────────────┤
                                                               ▼
                                                   Solve { scramble, tempo, giros, etapas }
                                                               │
                                              storage (Dexie) ─┴─▶ analysis ──▶ dicas / histórico
```

- O **timer não depende da visão**. O tempo vem sempre do teclado, e os giros são um dado complementar.
- A máquina de estados do timer tem o estado `cancelled`, que descarta o solve sem chamar o storage.
