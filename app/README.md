# Cubo 3x3 Trainer — app

Treino de cubo 3x3 no navegador (Chrome). Os dados ficam só neste navegador (IndexedDB).

```bash
npm install
npm run setup   # baixa o modelo de mãos do MediaPipe e copia o runtime para public/ (só para o rastreamento)
npm run dev     # http://localhost:5173 (trainer) e http://localhost:5173/solo.html (treino solo)
```

## Treino solo (`/solo.html`)

Tela só para registrar solves, sem câmera e sem inspeção. Segure espaço até ficar verde, solte para iniciar e aperte espaço para parar (outras teclas não param; **Esc** descarta o tempo recém-salvo). A cada solve aparece um scramble novo (random-state do cubing.js) e o botão ao lado mostra como as faces devem ficar. À esquerda ficam os tempos da sessão, com exclusão em dois cliques. As sessões são numeradas e só mudam com "Nova sessão"; a data mostrada é a de criação. A posição inicial para aplicar o scramble é **branco embaixo e verde na frente** (amarelo em cima, laranja à direita), definida em `src/cube-state/orientation.ts` e usada pela prévia das faces, pelo cubo virtual do solo e pelo cubo virtual da aba Timer. O escaneamento pela câmera mantém o protocolo próprio (branco em cima). O menu do solo tem também **F2L** (41 casos), **OLL** (57) e **PLL** (21), com os algoritmos do currículo: cada caso aparece como desenho (vista de cima para OLL/PLL e o par destacado para F2L), abre no cubo virtual para ver o algoritmo giro a giro, mostra um scramble para montar o caso no cubo real e guarda o status (novo, aprendendo, sei). "Praticar" sorteia casos (mais os que você está aprendendo), esconde o algoritmo até você pedir e atualiza o status pela sua resposta. Os dados ficam no IndexedDB `cubo-solo`, separado do trainer, e a engrenagem exporta/importa tudo em JSON, incluindo o progresso dos casos.

## Abas

| Aba | O que faz |
|---|---|
| **Timer** | Timer no estilo stackmat. Espaço: inspeção de 15 s com +2/DNF automáticos. Segure o espaço até ficar verde e solte. Qualquer tecla para. **Esc** cancela a tentativa ou descarta o tempo recém-salvo. Mostra o scramble, a comparação com o recorde e com as médias, as estatísticas (mo3, ao5, ao12, melhor e σ) e o cubo 3D com entrada manual de giros |
| **Histórico** | Gráfico de evolução, lista de solves com penalidade editável e exclusão, export/import do csTimer, "Analisar" (etapas CFOP, casos de OLL/PLL e dicas a partir da reconstrução) e "O que treinar" (resumo da sessão) |
| **Currículo** | Iniciante (camada por camada), intermediário (CFOP com 4LLL) e avançado (21 PLL, 57 OLL, 41 F2L e métodos alternativos), com progresso por item. As metas de ao12 são marcadas automaticamente |
| **Treino** | Trainer de algoritmos: scramble que monta o caso sem revelar o algoritmo, timer de execução, certo/errei e repetição espaçada |
| **Câmera** | Calibração das cores por posição e escaneamento das 6 faces. Valida o estado, mostra o cubo 3D, confere contra o scramble do timer e usa o estado no timer |
| **Rastreamento** | Experimental. Giros pela câmera (face verde para a câmera, devagar), nos modos Livre, Guiado (mede o acerto e salva o dataset) e Solve com câmera (grava, decodifica e reconstrói do vídeo) |

## Testes

| Comando | O que faz |
|---|---|
| `npm test` | Mais de 320 testes unitários, entre eles: estatísticas WCA, timer, modelo do cubo contra o KPuzzle, etapas CFOP, reconhecimento de OLL/PLL, todos os algoritmos do currículo, escaneamento e validação de estado, atribuição de cores, localizador de face (OpenCV em imagens sintéticas) e decodificador de giros sob ruído |
| `npm run e2e:solo` | Teste ponta a ponta do treino solo no Chrome headless: segurar/soltar/parar, foco, exclusão em dois cliques, prévia das faces, sessões, páginas de F2L/OLL/PLL (estudo e prática), export (copiar e baixar) e import |
| `npm run e2e` | Teste ponta a ponta no Chrome headless com uma **câmera sintética** (canvas). Passa por timer, histórico, análise, currículo, trainer, calibração, escaneamento das 6 faces, rastreamento guiado (guia fixo e localizador automático), máscara de mãos, solve com câmera e reconstrução do vídeo. Opcionalmente recebe uma pasta para screenshots |
| `npm run build` | Type-check estrito + build |
| `node scripts/f2l-search.mjs` | Busca exaustiva em ⟨R, U, F⟩ para casos de F2L ainda não cobertos pelo currículo |
