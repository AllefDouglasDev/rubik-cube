# 07 — TODOs e blockers

Cada item lista os seus **blockers**, ou seja, o que precisa estar pronto antes dele. "Nenhum" significa que o item pode começar já.

## Fase 0: Spikes de risco

São protótipos descartáveis. Os resultados são registrados em [`docs/spikes/`](spikes/README.md).

**Status:**
- S1 ✅ concluído: pipeline a 30 fps na GPU. A câmera é limitada a 30 fps e não tem controle de exposição/WB no Chrome.
- S5 ✅ concluído:
  - a licença do cubing.js é MPL-2.0 OR GPL-3.0, livre para uso como biblioteca;
  - `experimentalAddMove` existe;
  - KPuzzle, `randomScrambleForEvent` e o solver do `cubing/search` (20 movimentos em 5 ms) foram validados.
- S2: parcial. Com a face parada, a leitura é 100% correta.
  - Achados que já viraram mudança na ferramenta (e no app):
    - rejeição de adesivo "desconhecido" (`?`);
    - ΔE76 como métrica padrão;
    - calibração por posição;
    - atribuição com 9 adesivos por cor.
  - Falta repetir o xadrez vermelho/laranja com a calibração por posição e medir as outras 2 iluminações (com o cubo real).
- S3 ✅ implementado como o decodificador do app (`app/src/tracking/`). Validado em simulação a 1 observação por giro, com 0–3 adesivos cobertos e 3% de leituras erradas:
  - **97,6% de acerto por giro** em U/D/R/L/F, acima da meta de 95%;
  - 95,4% com B, sem ruído;
  - 84% com B e ruído juntos, que é o limite de ver uma face só.
  - Falta a medição com o cubo real, que sai do modo guiado.
- S4 ✅ ferramenta pronta: modo "Guiado" da aba Rastreamento.
  - O app pede o algoritmo, mede o acerto e salva as observações rotuladas em IndexedDB.
  - O dataset é exportado em JSON, e o vídeo pode ser baixado.
  - Falta gravar os 200 giros rotulados com o cubo real.

| ID | TODO | Critério de sucesso | Blockers |
|---|---|---|---|
| S1 | Benchmark de captura e inferência no M5 Pro (Chrome): fps da webcam (30 vs. 60), OpenCV.js, MediaPipe Hands e ORT-WebGPU rodando juntos em workers, além de testar o travamento de exposição e WB via `applyConstraints` | ≥30 fps com o pipeline completo | Nenhum |
| S2 | Classificação de cor: calibração por cubo, CIEDE2000 e votação multi-frame, testadas em 3 iluminações diferentes | ≥99% dos adesivos corretos com o cubo parado | Nenhum |
| S3 | Prova de conceito da detecção de giro lento: estado conhecido + diff dos adesivos visíveis + decodificador de 1 giro | ≥95% de acerto em giros de U, R e F a ~1 TPS | S1, S2 |
| S4 | Gravação guiada para montar o dataset rotulado (o app pede o algoritmo, o usuário executa, o vídeo é salvo) | 200 giros rotulados gravados | S2 |
| S5 | Verificar a licença do cubing.js e se a API `experimentalAddMove` existe | Decisão registrada | Nenhum |

**Decisão (gate):** se S1 ou S3 falharem, reavaliar o nativo (Swift/Vision/Core ML) antes da Fase 3.

## Fase 1: Base sem câmera

**Status (2026-10-01):** ✅ concluída em [`app/`](../app/README.md).
- Os 39 testes unitários e o teste ponta a ponta no Chrome passam.
- No F1.1, o lint é o type-check estrito do TypeScript; não há ESLint.
- No F1.3, a entrada manual é feita por botões e por um campo de algoritmo. Não há atalhos de letra, para não conflitar com o timer.

| ID | TODO | Blockers |
|---|---|---|
| F1.1 | Scaffold: Vite + React + TS, lint e testes | Nenhum |
| F1.2 | Wrapper do `cube-state` (KPuzzle) + geração de scramble | F1.1 |
| F1.3 | Cubo 3D com `<twisty-player>`, entrada manual de giros pelo teclado e fila de animações | F1.2, S5 |
| F1.4 | Máquina de estados do timer: inspeção de 15 s, avisos aos 8 e 12 s, +2 e DNF automáticos, segurar e soltar o espaço, **Esc para cancelar sem salvar** | F1.1 |
| F1.5 | Persistência em Dexie: Session e Solve, penalidade editável e exclusão de solve | F1.1 |
| F1.6 | Estatísticas: ao5, ao12, mo3, PB e desvio padrão, com DNF tratado conforme a WCA, além de testes unitários | F1.5 |
| F1.7 | Histórico: lista, comparação do tempo atual com o PB e com a média, e gráfico de evolução | F1.6 |
| F1.8 | Export e import de JSON compatível com o csTimer | F1.5 |

## Fase 2: Scan por câmera

**Status (2026-10-01):** ✅ implementada na aba "Câmera" do app.
- Calibração por posição, salva no navegador.
- Escaneamento guiado pela cor do centro (verde na frente e branco em cima; depois vermelho, azul, laranja, branco e amarelo), com captura automática quando a leitura estabiliza e o centro é o esperado.
- Rejeição de `?` na leitura ao vivo e atribuição final com 9 adesivos por cor (algoritmo húngaro).
- Validação do estado: peças existentes, torção, inversão e paridade. Os erros são explicados, e dá para corrigir clicando no adesivo da planificação.
- Conversão para o cubing.js, conferida contra o KPuzzle em 40 scrambles aleatórios.
- Cubo 3D, verificação contra o scramble do timer e envio do estado ao timer.
- O teste ponta a ponta usa uma câmera sintética com luz desigual por posição.
- **Falta validar com o cubo real** (depende das próximas medições do S2).

| ID | TODO | Blockers |
|---|---|---|
| F2.1 | Módulo `camera`: permissão, seleção de dispositivo e constraints | S1 |
| F2.2 | Fluxo de calibração das cores do cubo | S2, F2.1 |
| F2.3 | Escaneamento guiado das 6 faces com votação, **rejeição de adesivo "desconhecido"** por distância ou confiança, conferência do centro esperado, ΔE76 como métrica padrão, **calibração por posição** e **atribuição com restrição de 9 adesivos por cor** para resolver vermelho/laranja (achados do S2) | F2.2 |
| F2.4 | Validação do estado com o solver do `cubing/search` e mensagem de erro de leitura | F2.3, F1.2 |
| F2.5 | Sincronizar o estado escaneado com o cubo 3D, e verificar por câmera que o scramble foi aplicado corretamente | F2.4, F1.3 |

## Fase 3: Rastreamento de giros (P&D)

**Status (2026-10-01):** implementada como experimental na aba "Rastreamento" e validada com câmera sintética. **Falta a validação com o cubo real.**
- ✅ **F3.1:** localizador de face com OpenCV.js num worker.
  - Etapas: bordas, quadriláteros de adesivo, agrupamento por tamanho e ângulo, rede 3×3 e homografia.
  - Funciona com 5 ou mais adesivos visíveis, em qualquer posição, com rotação de até ±45° e com perspectiva.
  - Em simulação, localizou 36 de 40 faces em poses aleatórias. Quando falha, tenta de novo com a imagem ampliada 2×.
  - Opção "Localizar a face automaticamente" nas abas Câmera e Rastreamento. O padrão continua sendo o guia fixo.
- ✅ **F3.2:** máscara das mãos com MediaPipe (fecho convexo dos 21 pontos, com margem) e observações estáveis (`FaceObserver`: a leitura precisa concordar ao longo de 4 frames).
- ✅ **F3.3:** decodificador em feixe.
  - Expande cada hipótese em 0 a 2 giros por observação, com custo por giro e por adesivo divergente.
  - Confirma só os giros em que todas as hipóteses concordam.
  - Recupera giros invisíveis (B, S) quando o efeito deles aparece na frente.
  - O "prior pela mão" não foi implementado: a máscara só ignora os adesivos cobertos.
  - Rotações x/y/z ficam desligadas por padrão (o protocolo pede para não girar o cubo inteiro); a opção existe no código.
- ✅ **F3.4:** modos "Livre" e "Guiado", com o cubo 3D acompanhando os giros confirmados.
- ✅ **F3.5:** gravação do vídeo (MediaRecorder) no "Solve com câmera".
  - **Política de retenção:** o vídeo fica só na memória da aba, nada é gravado em disco. Dá para baixar o arquivo ou reconstruir a partir dele.
- ✅ **F3.6:** "Reconstruir do vídeo" passa o vídeo em 0,5× pela mesma pipeline (com máscara de mãos, se ativa) e com feixe maior. O estado final é conhecido, então:
  - `finish` escolhe a hipótese que chega ao resolvido com até 2 giros a mais;
  - se nenhuma chegar, o solver preenche a lacuna, e esses giros ficam marcados como `inferred`.
  - O resultado vai para o solve e para a análise de etapas.
- ✅ **F3.7:** métrica de acerto por giro (distância de edição) por sessão guiada, com média na tela. A versão simulada está em `decoder.test.ts`.
- ⏭️ **F3.8 (opcional):** não feito. Depende de um dataset real (S4) com volume suficiente para treinar um classificador.
| ID | TODO | Blockers |
|---|---|---|
| F3.1 | Detecção do cubo e homografia por frame (YOLO/ORT ou contornos) | S1, F2.3 |
| F3.2 | Máscara das mãos (MediaPipe) e detecção de janelas estáveis | S1 |
| F3.3 | Decodificador: candidatos de 1–2 giros, score por adesivo, prior pela mão, Viterbi/beam, e tratamento de rotações x/y/z | S3, F3.1, F3.2 |
| F3.4 | **Modo giro lento (tempo real)**: o cubo 3D acompanha ao vivo | F3.3, F1.3 |
| F3.5 | Gravação do vídeo durante o solve cronometrado (OPFS) com política de retenção | F2.1, F1.4 |
| F3.6 | **Reconstrução pós-solve**: decodificação offline, validação final (cubo resolvido) e preenchimento de lacunas com o solver | F3.3, F3.5 |
| F3.7 | Métrica de precisão por giro, medida com o dataset guiado | S4, F3.3 |
| F3.8 | (Opcional) Classificador temporal treinado no dataset | S4, F3.7 |

## Fase 4: Análise e dicas

**Status (2026-10-01):**
- ✅ **F4.1:** detector de etapas CFOP em `app/src/analysis/`, com um modelo próprio por adesivos, validado contra o KPuzzle. Ele não depende da cor da cruz, acompanha rotações, giros largos e fatias, e reconhece skips e solves incompletos. As fronteiras usam a regra "primeira vez que a condição é atingida", como no csTimer.
- ✅ **F4.3:** diagnósticos do catálogo de [03](03-solvers-e-analise.md).
  - Movimentos da cruz e por par, rotações e total de movimentos funcionam já.
  - Pausas no F2L, reconhecimento de OLL/PLL, divisão de tempo entre etapas e TPS dependem de giros com tempo, que virão do rastreamento.
- ✅ **F4.4:** "Analisar" funciona para um solve de cada vez. O painel "O que treinar" agrega a sessão: média de movimentos e de tempo por etapa, os alertas que mais se repetem e os casos de PLL, com o tempo médio de cada um.
- ✅ **F4.2:** reconhecimento de casos.
  - O PLL é reconhecido pelo nome entre os 21 casos.
  - O OLL é reconhecido pelo número (1–57), com a descrição 2-look junto, por exemplo "OLL 27 (Sune)".
  - Ambos funcionam de qualquer lado e com qualquer AUF.

| ID | TODO | Blockers |
|---|---|---|
| F4.1 | Detector de etapas CFOP (cruz, pares de F2L, OLL, PLL) e de etapas LBL | F1.2 |
| F4.2 | Tabela de casos de OLL e PLL para identificação | F4.1, F5.4 |
| F4.3 | Diagnósticos do catálogo em [03](03-solvers-e-analise.md) | F4.1, e giros com timestamp vindos de F3.4/F3.6 ou da entrada manual |
| F4.4 | Painel de dicas por solve e por sessão, com os piores casos e a etapa fora da curva | F4.3, F1.7 |

## Fase 5: Currículo e progresso

**Status (2026-10-01):**
- ✅ F5.1, F5.2 e F5.3 concluídos em `app/`.
- Todos os algoritmos dos JSON são validados por teste. Um teste de mutação confirmou que algoritmos digitados errado falham.
- O currículo tem uma aba própria, com progresso por item e por nível. Os marcos "ao12 < X s" são concluídos automaticamente pelo melhor ao12.
- ✅ **F5.4:** os 21 PLLs, os 57 OLLs e os 41 F2Ls estão no currículo avançado, todos validados por teste.
  - **PLL:**
    - cada algoritmo preserva o F2L e a orientação;
    - os 21 casos são distintos;
    - cada nome tem a estrutura da sua família (cantos e arestas fora do lugar, headlights);
    - Aa/Ab, Ua/Ub, Ga/Gb e Gc/Gd são inversos entre si.
  - **OLL:**
    - cada algoritmo preserva o F2L e orienta a última camada;
    - os 57 casos são distintos;
    - cada número está no grupo de formato certo (ponto, linha, L, cruz);
    - os OLLs 21–27 batem com os nomes dos cantos do 2-look.
  - **F2L:** cada algoritmo resolve só o par da frente-direita, e os 41 casos são distintos, ou seja, cobrem todos. Três algoritmos vieram de busca exaustiva (`app/scripts/f2l-search.mjs`), e a numeração é deste app.
- ✅ **F5.5:** aba "Treino".
  - Você escolhe os conjuntos do currículo.
  - O scramble monta o caso sem revelar o algoritmo: AUF aleatório e o inverso da solução do solver.
  - O timer de execução é o mesmo do stackmat, e cada tentativa é marcada como certa ou errada.
  - A repetição espaçada usa caixas de Leitner: um erro volta o caso para a caixa 1, e uma execução abaixo da meta sobe uma caixa.

Pode correr em paralelo com as Fases 2 a 4.

| ID | TODO | Blockers |
|---|---|---|
| F5.1 | Validar os algoritmos de 4LLL (jperm + teste automático com KPuzzle) | F1.2 |
| F5.2 | Tela de trilhas por nível, com títulos, itens e status | F1.5 |
| F5.3 | Progresso: status por item, metas atingidas automaticamente pelas médias (ex.: ao12 < 30 s) | F5.2, F1.6 |
| F5.4 | Semear os casos completos de F2L (41), OLL (57) e PLL (21) a partir de fonte com licença verificada | F5.1 |
| F5.5 | Trainer de algoritmos: caso renderizado pelo cubing.js, timer de execução e repetição espaçada | F5.4, F1.3 |

## Riscos e decisões em aberto

| Risco / pergunta | Impacto | Quando decidir |
|---|---|---|
| A precisão da câmera em speedsolves reais é provavelmente baixa, e ela deve funcionar bem só em giros lentos | As dicas da Fase 4 ficam limitadas | Medir com o modo Guiado (F3.7) e no Solve com câmera |
| Uma face visível não enxerga B e S, e com ruído o acerto cai para cerca de 84% por giro | Sequências com B ficam menos confiáveis | **Próximo passo de P&D:** usar 3 faces visíveis (cubo em ângulo) com o localizador |
| ~~O browser pode não aguentar o pipeline de visão~~ | — | Resolvido no S1: 30 fps com folga |
| ~~Licença GPL do cubing.js~~ | — | Resolvido no S5: MPL-2.0 como biblioteca |
| ~~Política de retenção dos vídeos~~ | — | Decidido no F3.5: só em memória, com download opcional |
| Reabrir a opção do smart cube se a câmera falhar | Rastreamento confiável | Após as medições reais do F3.7 |
