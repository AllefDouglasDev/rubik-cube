# Cubo 3x3 Trainer — Documentação (fase de pesquisa)

App para treinar o cubo 3x3. Ele vai fazer o seguinte:
- usar a webcam do notebook para acompanhar o cubo;
- replicar os giros num cubo 3D;
- cronometrar e salvar os solves;
- dar dicas de melhoria;
- conduzir o usuário por um currículo que vai de iniciante a avançado.

> Esta pasta começou como a fase de pesquisa e documentação. O código está em [`app/`](../app/README.md), e os protótipos de medição estão em [`spikes/`](../spikes/README.md).

## Decisões tomadas

| Tema | Decisão | Motivo |
|---|---|---|
| Plataforma | **Web (Chrome) primeiro** | O cubing.js resolve o 3D, a notação, os scrambles e o estado do cubo. OpenCV.js, MediaPipe e ONNX Runtime com WebGPU são suficientes para a visão. O app nativo (Swift/Vision) fica como plano B. |
| Rastreamento | **Só câmera** (sem smart cube) | Escolha do usuário. É o maior risco técnico do projeto (ver [01](01-visao-computacional.md)). |
| Armazenamento | Local-first (IndexedDB via Dexie) | Uso pessoal num só computador, sem precisar de backend. |
| Docs | Markdown neste repositório | — |

## Estado (2026-10-01)

O backlog de [07](07-todos-e-blockers.md) está implementado no [`app/`](../app/README.md), com 323 testes unitários e um teste ponta a ponta com câmera sintética.

**O que ainda depende do cubo real e da sua webcam:**
- completar as medições do S2 (vermelho/laranja com a calibração por posição e mais 2 iluminações);
- validar o escaneamento;
- gravar o dataset guiado de rastreamento (S4/F3.7) para medir o acerto real.

O classificador temporal (F3.8) é opcional e ficou de fora até haver dataset.

## Índice

1. [Visão computacional](01-visao-computacional.md): escaneamento do estado e reconhecimento de giros pela webcam.
2. [Renderização 3D](02-renderizacao-3d.md): cubo virtual.
3. [Solvers e análise de solves](03-solvers-e-analise.md): etapas CFOP e dicas.
4. [Timer e dados](04-timer-e-dados.md): regras WCA, médias, cancelamento e modelo de dados.
5. [Currículo](05-curriculo.md): métodos de iniciante, intermediário e avançado. Os dados estão em [`curriculum/`](curriculum/).
6. [Arquitetura proposta](06-arquitetura.md)
7. [TODOs e blockers](07-todos-e-blockers.md): backlog em fases.

## Convenções

- Os itens marcados **(verify)** vieram da pesquisa, mas não foram confirmados na fonte primária. Eles devem ser checados antes da implementação.
- Os números de fps e latência vêm de fontes secundárias. O Spike S1 mede esses valores no MacBook Pro M5 Pro.
- O nome do produto evita "Rubik's", que é marca registrada ativa. Usar "cubo 3x3" ou "speed cube".
