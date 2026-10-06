# 05 — Currículo de métodos

O currículo fica salvo no sistema em [`curriculum/`](curriculum/), num JSON por nível:
- [iniciante.json](curriculum/iniciante.json)
- [intermediario.json](curriculum/intermediario.json)
- [avancado.json](curriculum/avancado.json)

Cada item tem:
- `id`, `titulo`, `etapa` e `descricao` (texto próprio);
- `algoritmos` (quando houver);
- `meta` (critério de conclusão);
- `fontes`.

O progresso do usuário fica em `CurriculumProgress`, no IndexedDB (ver [04](04-timer-e-dados.md)). O JSON é só o conteúdo.

## Notação (Singmaster)

Fonte: [jperm.net/3x3/moves](https://jperm.net/3x3/moves)

- **Faces:** `U D R L F B` giram a face 90° no sentido horário, olhando de frente para ela.
- **Modificadores:** `'` gira no sentido anti-horário e `2` gira 180°.
- **Giros largos:** `r u f…` ou `Rw`, com duas camadas.
- **Fatias:**
  - `M` segue o sentido de L;
  - `E` segue o sentido de D;
  - `S` segue o sentido de F.
- **Rotações do cubo:**
  - `x` segue R;
  - `y` segue U;
  - `z` segue F.

## Benchmarks por nível

| Nível | Método | Média típica | Movimentos/solve |
|---|---|---|---|
| Iniciante | Camada por camada (LBL) | 1:00–2:00+ | 100–150 |
| Intermediário | CFOP + 4LLL | 25–45 s (sub-20 é possível) | 60–80 |
| Avançado | CFOP completo | sub-20 → sub-12 | 50–60 |

Aprender o 4LLL leva cerca de 2–4 semanas. A recomendação é passar para OLL/PLL completos por volta de sub-30. Os benchmarks são consenso da comunidade, não estatística formal.

## Iniciante: camada por camada

Fonte: [ruwix — beginner's method](https://ruwix.com/the-rubiks-cube/how-to-solve-the-rubiks-cube-beginners-method/)

1. Notação básica.
2. Cruz branca: intuitiva, com cada aresta alinhada ao centro lateral.
3. Cantos brancos: `R U R' U'`, repetido até o canto resolver.
4. Arestas da camada do meio:
   - para a direita: `U R U' R' U' F' U F`;
   - para a esquerda: `U' L' U L U F U' F'`.
5. Cruz amarela: `F R U R' U' F'`, repetido 1–3 vezes (ponto → L → linha → cruz).
6. Arestas amarelas: `R U R' U R U2 R' U`.
7. Posicionar cantos: `U R U' L' U R' U' L`.
8. Orientar cantos: `R' D' R D`, 2 ou 4 vezes por canto. Entre os cantos, girar só o U. É normal o cubo parecer bagunçado no meio.

## Intermediário: CFOP com 4LLL

Fontes:
- [jperm CFOP](https://jperm.net/3x3/cfop)
- [jperm LL](https://www.jperm.net/3x3/cfop/ll)
- [cubeskills 4LLL (PDF)](https://www.cubeskills.com/uploads/pdf/tutorials/4-look-last-layer.pdf)
- [speedsolving 2-Look PLL](https://www.speedsolving.com/wiki/index.php/2-Look_PLL)

1. Cruz embaixo, planejada na inspeção.
2. F2L intuitivo: emparelhar canto e aresta e inserir os dois juntos.
3. OLL de 2 looks, arestas (3 algoritmos).
4. OLL de 2 looks, cantos (7 algoritmos).
5. PLL de 2 looks, cantos (2 algoritmos).
6. PLL de 2 looks, arestas (4 algoritmos).

> **Validado (F5.1):** todos os algoritmos dos JSON passam por `app/src/curriculum/curriculum.test.ts`. O inverso de cada algoritmo é aplicado num cubo resolvido (KPuzzle) e o teste confere se o caso gerado é o esperado. Por exemplo:
> - os algoritmos de última camada preservam o F2L e os centros;
> - as arestas do OLL formam linha, L ou ponto;
> - os cantos do OLL têm o número certo de peças torcidas;
> - os PLLs mexem só nas peças certas.
>
> Um algoritmo com erro de digitação faz o teste falhar.

## Avançado

- **CFOP completo:**
  - 41 casos de F2L, 57 de OLL e 21 de PLL;
  - a ordem usual é aprender o PLL primeiro.
- **Lookahead:** acompanhar o próximo par enquanto resolve o atual.
- **Cross+1 / X-cross:** planejar na inspeção a cruz junto com o primeiro par.
- **Finger tricks e TPS:**
  - flick do U com o indicador direito;
  - U' com o indicador esquerdo;
  - M com o anelar;
  - algoritmos sem regrip.
- **Métodos alternativos:**
  - [Roux](https://www.speedsolving.com/wiki/index.php/Roux_method): blocos + CMLL + LSE;
  - [ZZ](https://www.speedsolving.com/wiki/index.php/ZZ_method): EOLine + F2L sem rotações.
- **Sets avançados de LL:**
  - COLL (42);
  - ZBLL (493);
  - WV (27) / VLS (216).
- Bancos de algoritmos para consulta: [algdb.net](https://algdb.net) e [speedcubedb.com](https://www.speedcubedb.com).

Os casos completos de F2L, OLL e PLL **não** estão no JSON avançado. Eles serão semeados na Fase 5, a partir de uma fonte com licença verificada ou digitados manualmente, e validados via KPuzzle. O JSON registra os módulos e a quantidade de casos.

## Licença e conteúdo

- **Algoritmos** são sequências de movimentos, ou seja, fatos e métodos, e estão replicados em todos os sites. O risco de armazená-los é baixo.
- **Não copiar:**
  - textos de tutorial;
  - imagens e diagramas de casos;
  - PDFs de jperm, ruwix e cubeskills;
  - dumps inteiros do algdb ou do speedcubedb sem checar os termos.
- **No lugar disso:**
  - escrever explicações próprias;
  - renderizar os casos com o cubing.js;
  - deixar links de atribuição.
- "Rubik's Cube" é marca ativa. Usar "cubo 3x3" no nome do app.
