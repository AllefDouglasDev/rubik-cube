# 03 — Solvers e análise de solves

## Solvers

| Lib | Notas |
|---|---|
| **`cubing/search`** (`experimentalSolve3x3x3IgnoringCenters`) | **Escolhido (S5).** Já vem no cubing.js e roda em worker. No teste, resolveu um scramble aleatório em 20 movimentos e 5 ms |
| [min2phase.js](https://github.com/cubing/min2phase.js) (original: [cs0x7f/min2phase](https://github.com/cs0x7f/min2phase)) | Kociemba two-phase. É a opção JS mais rápida e se integra ao KPuzzle e a Web Workers |
| [cubejs](https://www.npmjs.com/package/cubejs) | Port mais simples, com soluções de ≤22 movimentos. A inicialização é mais lenta |

Uso no app:
- **validar** um estado escaneado: um estado impossível indica erro de leitura;
- **preencher lacunas** na reconstrução por câmera;
- servir de **referência de eficiência**: comparar o número de movimentos do usuário com uma solução quase ótima. Isso é uma métrica, não uma dica de como um humano deveria resolver.

## Detecção de etapas CFOP (no modelo do csTimer)

Nenhuma biblioteca pronta faz isso. A referência é o código do [csTimer](https://github.com/cs0x7f/cstimer), que divide cada solve em cruz, F2L, OLL e PLL e identifica o caso de OLL/PLL.

Algoritmo:
1. Reproduzir os giros com timestamp sobre um estado KPuzzle, partindo do scramble.
2. Depois de cada giro, checar:
   - se a cruz está feita;
   - quantos pares de F2L estão resolvidos (de 0 a 4);
   - se a última camada está orientada (OLL feito);
   - se o cubo está resolvido.
3. A primeira vez que cada condição passa marca a fronteira entre etapas. Daí saem o tempo, o número de movimentos e o TPS de cada etapa.
4. Comparar o estado da última camada nesses pontos com a tabela de casos, para nomear o OLL ou PLL (ex.: "OLL 27", "T-perm").
5. Considerar todas as orientações e cores de cruz possíveis (uma por orientação dos centros).
6. Para cubers de LBL ou 4LLL, ter detectores equivalentes por etapa do método (ver [05](05-curriculo.md)).

As reconstruções podem ser exportadas no formato do [alg.cubing.net](https://alg.cubing.net), com comentários `// cross`, `// F2L 1` etc.

## Catálogo de diagnósticos e dicas

| Diagnóstico | Cálculo | Limiar / meta | Dica gerada |
|---|---|---|---|
| Cruz longa | Movimentos da cruz | Mais de 8 é sempre evitável (toda cruz sai em ≤8). Meta: 6–7. O ótimo médio é 5,81 HTM | Planejar a cruz inteira na inspeção; treinar a cruz embaixo |
| Cruz lenta | Tempo da cruz | Meta: menos de 3–5 s | Treinar cruz com inspeção cronometrada |
| F2L ineficiente | Movimentos por par | Cerca de 7–8 é bom; mais de 12 é ruim | Estudar os casos de F2L; evitar desfazer pares |
| Lookahead fraco | Pausas entre giros acima de 0,5–1 s durante o F2L (média e máxima por etapa) | — | Girar mais devagar, sem pausas; treinar lookahead |
| Rotações demais | Contagem de x/y/z | Mais de 2–4 por solve | Aprender inserções nos slots de trás |
| Reconhecimento lento | Tempo ocioso antes do OLL e do PLL | Mais de 1 s | Treinar o reconhecimento dos casos |
| TPS baixo | Movimentos ÷ tempo girando, por etapa | Intermediário: 3–5; avançado: 8+ | Finger tricks e algoritmos sem regrip |
| Desequilíbrio entre etapas | % do tempo por etapa | Cruz ~10–15%, F2L ~50%, OLL 15–20%, PLL 15–20% | Sugerir treino da etapa fora da curva |
| 4LLL num caso já aprendido | Dois looks num caso marcado como aprendido no OLL/PLL completo | — | Usar o algoritmo completo |
| Total de movimentos | Movimentos do solve vs. meta do nível | CFOP com mais de 70 indica F2L ineficiente | — |
| Eficiência relativa | Movimentos do usuário ÷ movimentos do solver | — | Métrica de acompanhamento |
| Casos piores | Média por caso de OLL/PLL | — | Lista dos 3 casos para treinar |

Fontes:
- [speedsolving wiki — Cross](https://www.speedsolving.com/wiki/index.php/Cross)
- [jperm CFOP](https://jperm.net/3x3/cfop)
- [cubeskills — how to get faster](https://www.cubeskills.com/blog/how-to-get-faster)
- [speedsolving — sub-20](https://www.speedsolving.com/threads/what-does-it-take-to-get-sub-20-average.91632/)

> Dependência: os diagnósticos precisam de **giros com timestamp**. Com o rastreamento só por câmera, a qualidade da análise depende da precisão da Fase 3. Os giros marcados como "inferidos" devem pesar menos ou ficar fora das métricas de tempo.
