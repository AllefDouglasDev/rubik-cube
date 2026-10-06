# 02 — Renderização 3D do cubo

## Recomendação

Usar o **cubing.js** (`<twisty-player>`) para o cubo virtual. Só partir para three.js/R3F próprio se o visual ou a performance exigirem.

## cubing.js

Links: [site](https://js.cubing.net/cubing/), [repo](https://github.com/cubing/cubing.js)

| Módulo | Uso no app |
|---|---|
| `cubing/twisty`, com `<twisty-player>` (TwistyPlayer) | Cubo 3D em three.js, animação dos giros e controles de replay. O scramble entra em `experimental-setup-alg` e o solve em `alg`. [Docs](https://js.cubing.net/cubing/twisty/) |
| `experimentalAddMove(move)` | Adiciona giros com animação, para espelhar ao vivo o que a câmera detectar. Confirmado no `TwistyPlayer` da v0.63.8 (S5) |
| `cubing/alg` | Parse e serialização de notação (algoritmos, scrambles, reconstruções) |
| `cubing/kpuzzle` | Modelo do estado do cubo: aplicar giros, comparar estados, checar "resolvido" ou "cruz feita". Base do decodificador ([01](01-visao-computacional.md)) e da análise ([03](03-solvers-e-analise.md)) |
| `cubing/scramble` | `randomScrambleForEvent("333")` gera scrambles no padrão oficial, num Web Worker. [Docs](https://js.cubing.net/cubing/scramble/) |

Pontos de atenção:
- A licença é **MPL-2.0 OR GPL-3.0-or-later** (confirmado no S5, v0.63.8). Usado como biblioteca, sem alterar o código dele, o app pode ter qualquer licença. Se o código do cubing.js for modificado, as modificações precisam ser publicadas.
- Existe um fork mais leve, com módulos carregados sob demanda: [bryanlundberg/cubing.js](https://github.com/bryanlundberg/cubing.js).
- Os casos de OLL/PLL/F2L do currículo podem ser renderizados pelo próprio cubing.js, o que evita copiar imagens de terceiros.

## Alternativa: three.js / react-three-fiber próprio

- Padrão: 26 cubinhos, ou um único `InstancedMesh`.
- Para girar uma camada:
  1. reparentar as 9 peças da camada num pivot temporário;
  2. rotacionar 90° com easing;
  3. fixar o ângulo exato e devolver as peças à cena.
- **Fila de animações:** quando chegam giros mais rápido do que a animação, acelerar a animação ou pular direto para o estado final. Isso é essencial no modo tempo real.
- Projetos de referência:
  - [RUBIX](https://github.com/ayoniyi/RUBIX)
  - [cubex (R3F)](https://github.com/chahe-dridi/cubex)
  - [ashique1213/Cube](https://github.com/ashique1213/Cube)
  - [r3f-101](https://github.com/rqbazan/react-three-fiber-101)
  - [Rust/WASM + three.js](https://eddmann.com/posts/building-a-rubik-cube-solver-using-rust-wasm-threejs-and-react/)

## Nativo (plano B)

- **SceneKit** é o caminho mais simples, mas a Apple o deprecou em favor do **RealityKit**.
- **Metal** é exagero para 27 cubos.
