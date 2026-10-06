# 04 — Timer e dados

## Regras WCA relevantes

Fonte: [WCA Regulations](https://regulations.worldcubeassociation.org/wca-regulations-and-guidelines.pdf)

- **Inspeção:** 15 s.
  - Começar entre 15 e 17 s soma **+2**.
  - Começar depois de 17 s é **DNF**.
- **ao5:** descarta o melhor e o pior tempo e faz a média dos 3 do meio.
- **ao12:** descarta o melhor e o pior tempo e faz a média dos 10 do meio. É o mesmo corte do csTimer **(verify)**.
- **DNF em médias:** um DNF conta como o pior tempo e é descartado. Se houver mais DNFs do que o número de tempos descartados, a média vira DNF.
- **mo3:** média simples de 3. Qualquer DNF faz o resultado ser DNF.

## Comportamento do timer (estilo stackmat no teclado)

1. A primeira tecla de espaço inicia a inspeção, se estiver ativada. Há avisos sonoros aos 8 s e aos 12 s.
2. Segurar o espaço deixa o display **vermelho**. Depois de 300–550 ms (configurável), ele fica **verde**.
3. Soltar o espaço com o display verde inicia o solve.
4. Qualquer tecla para o timer.
5. Depois de parar, o tempo pode ser marcado como OK, +2 ou DNF. A penalidade pode ser trocada depois.
6. **Cancelar (Esc):** pode ser usado durante a inspeção, durante o solve ou logo após parar. O solve é **descartado e não é salvo**, e não entra no histórico nem nas médias. Isso é diferente de DNF, que fica salvo como falha.
7. Após cada solve, o app mostra:
   - o tempo do solve;
   - a diferença para o PB e para a média da sessão;
   - as médias ao5 e ao12 atualizadas, com indicador de novo PB;
   - um gráfico de evolução.

## Timers de referência

- **[csTimer](https://cstimer.net)** ([repo](https://github.com/cs0x7f/cstimer), GPL):
  - sessões e todas as médias;
  - divisão de etapas CFOP e revisão de solves;
  - trainers.
- **[Twisty Timer](https://github.com/aricneto/TwistyTimer)**:
  - alertas de PB;
  - gráficos de ao5 a ao1000;
  - desvio padrão;
  - notas por solve;
  - export.
- **[CubeDesk](https://github.com/kash/cubedesk)** (GPL-3):
  - modo foco;
  - lock de scramble;
  - analytics;
  - trainer de algoritmos.

## Armazenamento local-first

- **Dexie (IndexedDB)** é a escolha inicial. É simples, suficiente para dezenas de milhares de solves, e `useLiveQuery` mantém a UI reativa.
- **SQLite-WASM + OPFS** é uma migração futura, se as estatísticas em SQL justificarem. Ele exige Web Worker. Fontes: [PowerSync](https://powersync.com/blog/sqlite-persistence-on-the-web), [RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- Manter o modelo "relacional" para facilitar essa migração.

## Modelo de dados

```ts
Session {
  id: string; name: string; puzzle: "333"; createdAt: number;
}

Solve {
  id: string; sessionId: string; createdAt: number;
  scramble: string;                 // notação WCA
  timeMs: number;                   // tempo bruto, sem penalidade
  penalty: "none" | "+2" | "dnf";   // separado do tempo, editável depois
  inspectionMs?: number;
  source: "keyboard" | "camera";
  trackingMode?: "realtime" | "post-reconstruction";
  videoRef?: string;                // referência ao vídeo gravado (OPFS), opcional
  moves?: { m: string; t: number /* ms desde o início */; confidence: number; inferred: boolean }[];
  phases?: {
    name: "inspection" | "cross" | "f2l1" | "f2l2" | "f2l3" | "f2l4" | "oll" | "pll" | string;
    startMs: number; endMs: number; moveCount: number; caseId?: string;
  }[];
  crossColor?: string; tps?: number; notes?: string; tags?: string[];
}

CurriculumProgress {
  itemId: string;                   // id do item em docs/curriculum/*.json
  status: "nao-iniciado" | "aprendendo" | "aprendido" | "dominado";
  bestExecMs?: number; reps: number; updatedAt: number;
}
```

Regras:
- Solves cancelados **nunca** são gravados.
- As médias (ao5, ao12…) são calculadas a partir da lista e cacheadas por sessão. Não são persistidas como verdade.
- O tempo efetivo é `timeMs + (penalty === "+2" ? 2000 : 0)`, e DNF vale infinito.
- Haverá export/import em JSON compatível com o csTimer, para backup e migração.
- O vídeo gravado para a reconstrução pós-solve ocupa muito espaço. Por isso, precisa de política de retenção, por exemplo manter só os N últimos ou apagar depois de reconstruir.
