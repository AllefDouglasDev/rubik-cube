# 01 — Visão computacional

## Resumo

- **Escanear o estado** do cubo pela webcam, uma face por vez, é um **problema resolvido**. Existem vários projetos open source que fazem isso.
- **Reconhecer giros em tempo real** só com uma webcam, na velocidade de speedcubing, **não tem solução pronta**. Não encontramos nenhum projeto ou paper que faça isso.
- Como o rastreamento será **só por câmera**, ele vira uma trilha de P&D. Antes de construir a UI que depende dele, os spikes S1–S4 precisam validar a ideia (ver [07](07-todos-e-blockers.md)).

## 1. Escaneamento de estado: projetos de referência

| Projeto | Stack | Técnica | Observações |
|---|---|---|---|
| [qbr](https://github.com/kkoomen/qbr) | Python/OpenCV | Canny + contornos; cor por **CIEDE2000**; modo de calibração | Diz ter ~99,9% de acerto "com iluminação adequada" |
| [cube-cv](https://github.com/HANS-2002/cube-cv) | OpenCV.js (browser) | Contornos + cor | É a prova de que dá para fazer no browser |
| [Bishwaswarup/rubiks](https://github.com/Bishwaswarup/rubiks) | OpenCV | Mediana de vários frames; aceita a face só se ≥80% dos frames recentes concordam nos 9 adesivos | **Padrão a copiar** |
| [RubikVision](https://github.com/Charles-AM/RubikVison) | OpenCV | HSV + votação de 5 frames | Só detecta que o cubo está resolvido, para parar o timer. Não detecta giros |
| [CubeCV](https://github.com/CubeLabsNZ/CubeCV) | DINO + LangSAM + CV clássico | Estado a partir de vídeo | Não é tempo real; falha quando as mãos cobrem os cantos |
| [MigicCube](https://github.com/idootop/MigicCube) / [artigo](https://medium.com/@widlarosa/how-i-built-a-real-time-rubiks-cube-detector-solver-with-yolo-and-opencv-bd8cc604b7b1) | YOLO11 + OpenCV | O YOLO localiza o cubo e o OpenCV lê os adesivos | É uma boa arquitetura em dois estágios |

## 2. Reconhecimento de giros: estado da arte

- **OpenAI, "Solving Rubik's Cube with a Robot Hand"** ([arXiv 1910.07113](https://arxiv.org/abs/1910.07113)):
  - usaram 3 câmeras e uma CNN para estimar o ângulo das faces;
  - o paper conclui que, por causa da simetria dos adesivos, **não dá para prever o ângulo absoluto de uma face num único frame**: é preciso acompanhar o cubo ao longo do tempo;
  - por isso usaram um Giiker modificado, com erro médio de ~5,9°.
- **Rubikon (2025, tutoria em AR)** ([arXiv 2503.12619](https://arxiv.org/html/2503.12619v1)):
  - colaram marcadores ArUco em cada adesivo;
  - o giro é inferido comparando a mudança de estado com templates de rotação;
  - funciona na velocidade de quem está aprendendo e não publica números de precisão.
- **Conclusão:** não encontramos nada que funcione a 8–10 TPS com as mãos cobrindo o cubo.

## 3. Problemas de viabilidade

| Problema | Impacto | Mitigação |
|---|---|---|
| A 8–10 TPS, cada giro dura ~100 ms, ou seja, ~3 frames a 30 fps, com blur | Só os estados *antes* e *depois* ficam nítidos | Capturar a 60 fps se a câmera permitir (S1). Inferir os giros pela diferença de estado, não pelo movimento em si |
| As mãos cobrem 30–60% dos adesivos | As observações ficam parciais | Usar só os adesivos visíveis e confiáveis, com um decodificador probabilístico (seção 5) |
| Só 3 faces ficam visíveis | Giros de B, D, L e das fatias (M/E/S) ficam ocultos ou parciais | Restringir o espaço de giros e validar no final (o cubo tem que estar resolvido) |
| Rotações x/y/z parecem giros | Giro e rotação se confundem | Acompanhar a orientação dos centros: numa rotação os centros mudam, num giro de face não |
| Iluminação: branco/amarelo e vermelho/laranja | Cores trocadas | Calibrar por cubo e por sessão; usar distância CIEDE2000 em Lab; travar a exposição se possível |
| Auto-exposição e white balance da webcam variam | As cores mudam durante o uso | `MediaStreamTrack.applyConstraints` (`exposureMode`, `whiteBalanceMode`), que **não é suportado** na câmera interna do MacBook pelo Chrome (S1). No nativo, o AVFoundation trava os dois |

## 4. Stack web

- **Captura:** `getUserMedia` + `HTMLVideoElement.requestVideoFrameCallback`, para processar cada frame apresentado.
- **OpenCV.js:** contornos, homografia e conversão de cor. O build WASM tem ~8 MB, então carregar sob demanda e rodar num Web Worker.
- **MediaPipe Tasks Vision, Hand Landmarker:** 21 landmarks por mão, com delegate de GPU. A única referência encontrada foi ~18 fps num app JS num M1 Mac mini, que não é este modelo, então precisa de benchmark próprio. [Docs](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
- **ONNX Runtime Web com WebGPU:** relatam YOLOv8n a 30+ fps no browser. Com WASM são ~220 ms por frame num M3 Pro, então **usar WebGPU**. Fontes: [benchmark](https://github.com/nomi30701/yolo-onnx-benchmark-web), [docs](https://onnxruntime.ai/docs/tutorials/web/)
- **TensorFlow.js:** é uma alternativa, com backends WebGL e WebGPU.
- **Estimativa:** mão + cubo + amostragem de cor a 30 fps é provavelmente viável num M-series com Chrome. A 60 fps fica apertado. O Spike S1 confirma.

## 5. Abordagem proposta (só câmera)

**Ideia central:** o estado inicial é conhecido, e cada giro é **decodificado a partir das mudanças de estado observadas**. O app não tenta "ver o giro acontecendo".

1. **Estado inicial conhecido.** Ele vem de duas formas:
   - o app gera o scramble e o usuário o aplica a partir de um cubo resolvido (com verificação por câmera);
   - ou o app escaneia as 6 faces (Fase 2).
2. **Localizar o cubo** em cada frame:
   - detector (YOLO pequeno via ORT-WebGPU), ou contornos/`approxPolyDP` no OpenCV.js;
   - homografia de cada face visível para uma grade 3x3.
3. **Observação por janela estável:**
   - quando o movimento entre frames cai abaixo de um limiar (o cubo está parado ou quase), o app amostra os adesivos visíveis que não estão cobertos pela mão (máscara dos landmarks do MediaPipe);
   - cada adesivo sai com uma confiança de cor.
4. **Decodificador:**
   - a partir do estado atual, gerar os candidatos a 1–2 giros (18 giros de face + fatias + rotações);
   - pontuar cada candidato pela compatibilidade com os adesivos observados;
   - usar a posição e o movimento das mãos (landmarks) como *prior* de qual face girou;
   - fazer Viterbi/beam search ao longo do tempo para escolher a sequência mais provável.
5. **Validação no final:**
   - o estado final tem que ser "resolvido";
   - se o caminho for inconsistente, uma busca (com o solver do `cubing/search`) preenche as lacunas entre as observações confiáveis, e esses giros ficam marcados como "inferidos".
6. **Dois modos de produto:**
   - **Giro lento / aprendizado (tempo real):** o cubo 3D acompanha ao vivo. É para treinar algoritmos e o método de iniciante.
   - **Reconstrução pós-solve:** grava o vídeo durante o solve cronometrado e reconstrói os giros depois, com mais processamento e com o resultado final conhecido. O timer não depende da visão.

### Coleta de dados sem smart cube: gravação guiada

- O app pede um algoritmo conhecido (ex.: `R U R' U'`), o usuário executa, e o app grava o vídeo.
- O rótulo de cada trecho já é conhecido, então não é preciso anotar à mão.
- Isso permite criar um dataset para treinar um classificador temporal (pequena CNN-1D/transformer sobre landmarks + recortes do cubo) e medir a precisão por giro.

## 6. Plano B nativo (macOS / Swift)

Usar se os spikes S1 ou S3 mostrarem que o browser não dá conta:
- **AVFoundation:** captura a até 60 fps na câmera do MacBook, com **exposição e white balance travados**.
- **Vision:**
  - `VNDetectHumanHandPoseRequest`: 21 juntas, roda no Neural Engine;
  - `VNDetectRectanglesRequest`: ajuda a achar as faces.
- **Core ML / Create ML:**
  - detector de objetos (cubo e adesivos);
  - classificador de ações sobre sequências de hand pose, que pode cobrir tipos de giro como R e U'.
- Tem menor latência e é mais eficiente que WebGPU. O custo é refazer o cubo 3D (SceneKit/RealityKit) e portar solver e análise.

## 7. Referência: smart cubes (descartados por decisão)

Ficam registrados porque são a forma confiável de rastrear giros, caso a câmera não atinja a precisão necessária:
- **Bibliotecas:**
  - [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) (MIT): GAN Gen2–4 e MoYu AI;
  - [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth): GAN, Giiker, GoCube, MoYu e QiYi.
- **Suporte:** Web Bluetooth funciona no Chrome/Edge do macOS e não funciona no Safari.
- Também serviriam de *ground truth* para rotular os vídeos de treino.

## 8. Implementação e resultados (2026-10-01)

A abordagem da seção 5 está implementada no app (`app/src/vision`, `app/src/tracking`). Resultados medidos:

| Componente | Resultado | Onde |
|---|---|---|
| Pipeline na GPU (S1) | 30 fps com OpenCV + MediaPipe + YOLO juntos, p95 de 24 ms. A câmera interna é limitada a 30 fps | Webcam real, `docs/spikes` |
| Leitura de cor (S2) | 100% dos adesivos com a face parada. Vermelho/laranja falhava com a calibração média, o que levou à calibração por posição e à atribuição 9-por-cor | Webcam real, parcial |
| Localizador de face (F3.1) | 36/40 faces em poses aleatórias (escala, ±35°, perspectiva, dedos) | Imagens sintéticas |
| Decodificador (S3/F3.3) | 97,6% por giro em U/D/R/L/F com oclusão e 3% de erros de leitura. Com B: 95,4% sem ruído e 84% com ruído | Simulação |
| Ponta a ponta | Sune decodificado 100% (guia fixo e localizador), solve de ~20 giros recuperado ao vivo e do vídeo | Câmera sintética no Chrome |

**Limite conhecido:** com uma face visível, giros de B e S só aparecem depois. O próximo passo de P&D é usar 3 faces visíveis (cubo em ângulo), aproveitando o localizador.

