# Spikes S1 e S2 — protocolo e resultados

A ferramenta está em [`spikes/`](../../spikes/README.md). Rode no Chrome, no MacBook Pro M5 Pro, com o carregador ligado. Salve os JSON baixados em `docs/spikes/resultados/` e preencha as tabelas abaixo.

## S1 · Benchmark de captura e inferência

**Pergunta:** a webcam entrega 60 fps? O pipeline completo (OpenCV.js + MediaPipe Hands + YOLO no ONNX Runtime) roda a ≥30 fps em workers?

**Protocolo** (em `/s1.html`):
1. Abrir a câmera em 1280×720 pedindo 60 fps e anotar o fps medido e o fps em `settings`.
2. Clicar em "Travar exposição/WB" e anotar se a câmera suporta (`capabilities.exposureMode` e `whiteBalanceMode`).
3. Rodar uma série de 20 s em cada combinação abaixo e baixar o relatório no fim:

| # | Câmera | Largura processada | Estágios | Backends |
|---|---|---|---|---|
| 1 | 720p @ 60 | 640 | só OpenCV | — |
| 2 | 720p @ 60 | 640 | só MediaPipe | GPU |
| 3 | 720p @ 60 | 640 | só ORT | webgpu |
| 4 | 720p @ 60 | 640 | os três | GPU / webgpu |
| 5 | 720p @ 60 | 640 | os três | CPU / wasm (controle) |
| 6 | 1080p @ 30 | 960 | os três | GPU / webgpu |

**Sucesso:** a rodada 4 com todos os estágios a ≥30 fps e latência p95 abaixo de 50 ms.

**Resultados (2026-10-01).** Ambiente: Chrome 154, MacBook Pro Camera, GPU Apple Metal 3, `crossOriginIsolated`. Rodado com `npm run bench:s1` (20 s por rodada). O relatório está em [`resultados/s1-2026-10-01T18-07-57.json`](resultados/s1-2026-10-01T18-07-57.json).

| # | Câmera real | OpenCV fps / proc | MediaPipe fps / proc | ORT fps / proc | Latência p95 |
|---|---|---|---|---|---|
| 1 | 720p @ 30 | 30 / 7,3 ms | — | — | 16 ms |
| 2 | 720p @ 30 | — | 31 / 12,0 ms (GPU) | — | 21 ms |
| 3 | 720p @ 30 | — | — | 30 / 13,1 ms (WebGPU) | 23 ms |
| 4 | 720p @ 30 | 30 / 5,8 ms | 31 / 13,0 ms (GPU) | 31 / 15,2 ms (WebGPU) | 24 ms |
| 5 | 720p @ 30 | 30 / 4,9 ms | **18 / 40 ms (CPU)** | **15 / 50 ms (wasm)** | 59 ms |
| 6 | 1080p @ 30 | 30 / 10,0 ms | 30 / 12,9 ms (GPU) | 30 / 15,3 ms (WebGPU) | 23 ms |

Nenhuma rodada perdeu frames da câmera, e `createImageBitmap` custou menos de 0,5 ms.

**Conclusões:**
- **O pipeline completo passa:** os três estágios rodam juntos a 30 fps, com p95 de 24 ms, dentro do orçamento de 33 ms por frame. Ainda sobram cerca de 15 ms por estágio para a lógica real.
- **GPU é obrigatória.** Com CPU/wasm, o MediaPipe cai para 18 fps e o ORT para 15 fps.
- **A câmera é limitada a 30 fps** (`capabilities.frameRate.max = 30`). Pedir 60 não muda nada. A 8–10 TPS, isso dá cerca de 3 frames por giro, o que confirma o risco descrito em [01](../01-visao-computacional.md). Para ter 60 fps, seria preciso uma webcam externa, ou verificar se o AVFoundation (nativo) expõe 60 fps na câmera interna (pergunta em aberto).
- **O Chrome não expõe controle de exposição nem de white balance** nesta câmera: `exposureMode` e `whiteBalanceMode` aparecem como ausentes. A cor vai variar com a auto-exposição, o que o S2 precisa medir. No nativo, o AVFoundation permite travar os dois.

**Veredito S1:** ✅ aprovado para 30 fps no browser. A limitação de 30 fps vale para qualquer plataforma que use a câmera interna até prova em contrário.

## S2 · Classificação de cor

**Pergunta:** com calibração por cubo, CIEDE2000 e votação, a leitura de um cubo parado chega a ≥99% dos adesivos corretos em iluminações diferentes?

**Protocolo** (em `/s2.html`), repetido em pelo menos **3 iluminações**: luz do dia, lâmpada quente e noite só com a luz do monitor.
1. Abrir a câmera. Opcionalmente, travar a exposição e o WB.
2. **Calibrar:** com o cubo resolvido, encaixar cada face no guia e clicar na cor correspondente. Depois, salvar com o nome da iluminação.
3. **Medir** 10 s para cada caso:
   - padrão **Resolvido**, com o centro em cada uma das 6 cores;
   - padrão **Xadrez (M2 E2 S2)**, com o centro em branco, vermelho e azul. Esse padrão coloca lado a lado os pares que mais se confundem (branco/amarelo, vermelho/laranja, azul/verde).
4. **Robustez:** carregar a calibração de *outra* iluminação e medir o xadrez de novo.
5. Baixar o relatório.

**Novidade (2026-10-01):**
- A ferramenta rejeita adesivos "desconhecidos" (`?`) por distância máxima e confiança mínima. Os padrões são ΔE76 ≤ 20, CIEDE2000 ≤ 12 e confiança ≥ 0,1, todos ajustáveis.
- Cada medição registra:
  - `unknownRate`;
  - `nearestAccuracy`, a acurácia sem a rejeição;
  - `correctDistance`, a distância das leituras corretas, para calibrar o limite.
- Repetir a medição com fundo ou mão no guia deve resultar em **zero aceitas erradas**.

**Sucesso:**
- adesivos corretos ≥99% com a métrica padrão (ΔE76);
- **zero** faces aceitas erradas pela votação.

**Resultados:**

| Iluminação | Calibração | Padrão | Adesivos CIEDE2000 | Adesivos ΔE76 | Aceitas erradas | Confusões principais |
|---|---|---|---|---|---|---|
| luz-2 | luz-2 | Resolvido, centro W (rodada 1) | **73,4%** | 86,3% | **81** (CIEDE2000) / 59 (ΔE76) | W→R 296, W→B 267, W→O 154 |
| luz-2 | luz-2 | Resolvido, centro W (rodada 2) | 100% | 100% | 0 | nenhuma |
| luz-2 | luz-2 | Xadrez, centro W | 100% (300 frames) | 100% | 0 | nenhuma. Confiança média: 0,50 (CIEDE2000) / 0,62 (ΔE76); aceitação em 329 ms |

| luz-2 | luz-2 | Xadrez Y (rejeição ligada) | 78,4% (21,6% `?`) | **100%** | 0 | CIEDE2000 rejeitou o branco: limite 12 apertado demais |
| luz-2 | luz-2 | Xadrez W (rejeição ligada) | 99,6% | **100%** | 0 | — |
| luz-2 | luz-2 | Xadrez **R** (rejeição ligada) | 78,1% (`?`) | **88,9%** | **292 (ΔE76)** | **R→O em 100% dos frames, sempre 1 adesivo** |
| luz-2 | luz-2 | Xadrez **O** (rejeição ligada) | 68,0% (`?`) | **88,6%** | **272 (ΔE76)** | **R→O em 100% dos frames, sempre 1 adesivo** |
| luz-2 | luz-2 | Xadrez B (rejeição ligada) | 86,1% (`?`) | 97,1% (2,9% `?`) | 0 | só rejeições |
| luz-2 | luz-2 | Xadrez G (rejeição ligada) | 88,9% (`?`) | 96,8% (3,2% `?`) | 0 | só rejeições |

O relatório completo está em [`resultados/s2-2026-10-01-luz-2.json`](resultados/s2-2026-10-01-luz-2.json). As rodadas de xadrez com rejeição estão em [`resultados/s2-2026-10-01-luz-2-xadrez-rejeicao.json`](resultados/s2-2026-10-01-luz-2-xadrez-rejeicao.json). Elas foram gravadas com o rótulo "luz-1" por engano, mas foram medidas na luz-2.

**Achados (2026-10-01, parcial):**
- **Com a face parada no guia, a leitura é perfeita.** Na rodada 2, a votação aceitou a face em 320 ms e não houve nenhum erro.
- **Na rodada 1, a votação aceitou faces erradas (81 vezes).** A primeira aceitação levou 3,6 s, o que sugere que a face ainda estava sendo posicionada ou que o guia pegava fundo ou mão. O problema é que o classificador sempre escolhe *alguma* das 6 cores: fundo e mão parados viram leituras "estáveis" e erradas.
  - **Correção necessária, antes da F2.3:** rejeitar um adesivo cuja distância à cor mais próxima passe de um limite (ou cuja confiança seja baixa), marcando-o como "desconhecido", e não aceitar a face enquanto houver desconhecidos. Exigir também que o centro da face seja o esperado.
- **ΔE76 separou melhor as cores do que CIEDE2000** neste cubo e nesta luz: a confiança média foi 0,64 contra 0,42, e houve menos erros na rodada 1. O CIEDE2000 comprime as diferenças entre cores muito saturadas, então **o ΔE76 passa a ser o padrão** até que novas medições digam o contrário.
- **Vermelho e laranja são o ponto crítico (xadrez R e O).**
  - Um adesivo vermelho foi lido como laranja em 100% dos frames, e a votação aceitou a face errada cerca de 280 vezes. A rejeição não pegou, porque o vermelho mais claro tem distância e confiança normais em relação ao laranja.
  - Como o erro foi sempre em 1 adesivo, a hipótese é iluminação desigual dentro do guia: a calibração média (9 posições juntas) não representa o vermelho daquela posição.
  - **Correções:**
    - calibração **por posição**, com 9 referências por cor;
    - a métrica **ΔE76 com L pela metade**, porque a diferença de luz aparece sobretudo no L;
    - a confusão passa a registrar a posição (`R→O@3`).
  - **Para a F2.3:** num scan completo existem exatamente 9 adesivos de cada cor. Uma atribuição com essa restrição (algoritmo húngaro) corrige R/O ambíguos, e a validação de estado pelo solver rejeita cubos impossíveis.
- **O limite de rejeição estava apertado:** as leituras corretas chegaram a ΔE76 22,6 e CIEDE2000 16,9. Os novos padrões são 25 e 16; com a calibração por posição, as distâncias devem cair.
- **Faltam** o padrão xadrez, as outras 2 iluminações e o teste de robustez com a calibração de outra luz. A Fase 1 começou em paralelo, porque não depende da câmera.

## Decisão

Preencher depois das medições:
- [x] S1 aprovado (30 fps; ver limitações acima)
- [ ] S2: parcial (100% com a face parada; falta a rejeição de "desconhecido" e completar o protocolo)
- [ ] Se S1 for reprovado: reavaliar o nativo (Swift/Vision) antes da Fase 3.

## S5 · cubing.js (2026-10-01)

Testado com `cubing@0.63.8` em Node, com um script descartável.

| Item | Resultado |
|---|---|
| Licença | `MPL-2.0 OR GPL-3.0-or-later`. O README do projeto diz que, usado como biblioteca, ele pode ser tratado como MPL: o app pode ter qualquer licença. Modificações no código do cubing.js precisam ser publicadas |
| `experimentalAddMove` | Existe em `TwistyPlayer`: `experimentalAddMove(move: Move \| string, options?)`. Também existem `experimentalAddAlgLeaf` e `experimentalRemoveFinalChild`, este último útil para desfazer um giro mal detectado |
| KPuzzle | `cube3x3x3.kpuzzle()` → `defaultPattern().applyAlg(...)` e `experimentalIsSolved(...)`. T-perm aplicado duas vezes volta ao resolvido ✅ |
| Scramble | `randomScrambleForEvent("333")` vem de `cubing/scramble`. Gerou um scramble em 83 ms (o primeiro, que inclui a inicialização) |
| Solver | `experimentalSolve3x3x3IgnoringCenters` (`cubing/search`) resolveu o scramble em 20 movimentos e 5 ms, e a solução foi conferida ✅. Com isso, o min2phase separado deixa de ser necessário |

**Veredito S5:** ✅ o cubing.js cobre o cubo 3D, a notação, o estado, o scramble e o solver.
