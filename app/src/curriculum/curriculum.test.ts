// F5.1: every algorithm of the curriculum must solve the case its name claims.
import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { loadKPuzzle } from "../cube-state/cubeState";
import { type CaseProfile, flipShape, profileAlg } from "./caseProfile";
import { LEVELS, ao12TargetMs } from "./curriculum";

const algs = new Map<string, string>(LEVELS.flatMap((l) => l.itens.flatMap((i) => i.algoritmos.map((a) => [`${i.id}/${a.nome}`, a.alg] as const))));

const lastLayerOnly = (p: CaseProfile) => {
  expect(p.centersSolved).toBe(true);
  expect(p.f2lSolved).toBe(true);
};
const oriented = (p: CaseProfile) => {
  expect(p.flippedEdges).toEqual([]);
  expect(p.twistedCorners).toBe(0);
};

// Expected case for each algorithm, keyed by "<item id>/<alg name>".
const EXPECTATIONS: Record<string, (p: CaseProfile) => void> = {
  "ini-04-meio/Inserir à direita": (p) => {
    expect(p.centersSolved).toBe(true);
    expect(p.firstLayerSolved).toBe(true);
    expect(p.f2lSolved).toBe(false);
  },
  "ini-04-meio/Inserir à esquerda": (p) => {
    expect(p.centersSolved).toBe(true);
    expect(p.firstLayerSolved).toBe(true);
    expect(p.f2lSolved).toBe(false);
  },
  "ini-05-cruz-amarela/Cruz amarela": (p) => {
    lastLayerOnly(p);
    expect(p.flippedEdges).toHaveLength(2);
  },
  "ini-06-arestas-amarelas/Troca de arestas": (p) => {
    lastLayerOnly(p);
    expect(p.flippedEdges).toEqual([]);
    expect(p.edgesOutOfPlace).toBeGreaterThan(0);
  },
  "ini-07-posicionar-cantos/Ciclo de cantos": (p) => {
    lastLayerOnly(p);
    expect(p.flippedEdges).toEqual([]);
    expect(p.edgesOutOfPlace).toBe(0);
    expect(p.cornersOutOfPlace).toBe(3);
  },
  "int-03-oll-arestas/Linha": (p) => {
    lastLayerOnly(p);
    expect(flipShape(p.flippedEdges)).toBe("line");
  },
  "int-03-oll-arestas/L": (p) => {
    lastLayerOnly(p);
    expect(flipShape(p.flippedEdges)).toBe("L");
  },
  "int-03-oll-arestas/Ponto": (p) => {
    lastLayerOnly(p);
    expect(flipShape(p.flippedEdges)).toBe("dot");
  },
  ...Object.fromEntries(
    (
      [
        ["Sune", 3],
        ["Antisune", 3],
        ["H", 4],
        ["Pi", 4],
        ["Headlights", 2],
        ["T", 2],
        ["Bowtie", 2],
      ] as const
    ).map(([name, twisted]) => [
      `int-04-oll-cantos/${name}`,
      (p: CaseProfile) => {
        lastLayerOnly(p);
        expect(p.flippedEdges).toEqual([]);
        expect(p.twistedCorners).toBe(twisted);
      },
    ]),
  ),
  "int-05-pll-cantos/Headlights (T-perm)": (p) => {
    lastLayerOnly(p);
    oriented(p);
    expect(p.cornersOutOfPlace).toBe(2);
  },
  "int-05-pll-cantos/Diagonal (Y-perm)": (p) => {
    lastLayerOnly(p);
    oriented(p);
    expect(p.cornersOutOfPlace).toBe(2);
  },
  ...Object.fromEntries(
    (
      [
        ["Ua", 3],
        ["Ub", 3],
        ["H", 4],
        ["Z", 4],
      ] as const
    ).map(([name, edges]) => [
      `int-06-pll-arestas/${name}`,
      (p: CaseProfile) => {
        lastLayerOnly(p);
        oriented(p);
        expect(p.cornersOutOfPlace).toBe(0);
        expect(p.edgesOutOfPlace).toBe(edges);
      },
    ]),
  ),
};

// Full PLL set: last layer only and oriented (case identity is covered in analysis/llCases.test.ts).
for (const key of algs.keys()) {
  if (key.startsWith("adv-01-pll-completo/")) {
    EXPECTATIONS[key] = (p) => {
      lastLayerOnly(p);
      oriented(p);
      expect(p.cornersOutOfPlace + p.edgesOutOfPlace).toBeGreaterThan(0);
    };
  }
}

// Full OLL set: last layer only, orients the last layer.
for (const key of algs.keys()) {
  if (key.startsWith("adv-02-oll-completo/")) {
    EXPECTATIONS[key] = (p) => {
      lastLayerOnly(p);
      expect(p.flippedEdges.length + p.twistedCorners).toBeGreaterThan(0);
    };
  }
}

// F2L cases: only the front-right pair is out (cross, other slots and centers intact), in the U layer or its slot.
const F2L_KEYS = [...algs.keys()].filter((k) => k.startsWith("adv-03-f2l-casos/"));
for (const key of F2L_KEYS) EXPECTATIONS[key] = () => undefined; // checked in the dedicated block below

async function f2lCaseKey(alg: string): Promise<string> {
  const kpuzzle = await loadKPuzzle();
  const p = kpuzzle.defaultPattern().applyAlg(new Alg(alg).invert());
  const { EDGES, CORNERS, CENTERS } = p.patternData;
  const solvedAt = (o: typeof EDGES, idx: number[]) => idx.every((i) => o.pieces[i] === i && o.orientation[i] === 0);
  expect(CENTERS.pieces.every((x, i) => x === i)).toBe(true);
  expect(solvedAt(EDGES, [4, 5, 6, 7, 9, 10, 11]), "cruz e outros slots (arestas)").toBe(true);
  expect(solvedAt(CORNERS, [5, 6, 7]), "outros slots (cantos)").toBe(true);
  expect([0, 1, 2, 3, 4]).toContain(CORNERS.pieces.indexOf(4));
  expect([0, 1, 2, 3, 8]).toContain(EDGES.pieces.indexOf(8));
  let best: string | null = null;
  for (const auf of ["", "U", "U2", "U'"]) {
    const q = auf ? p.applyAlg(auf) : p;
    const c = q.patternData.CORNERS.pieces.indexOf(4);
    const e = q.patternData.EDGES.pieces.indexOf(8);
    const key = `c${c}o${q.patternData.CORNERS.orientation[c]}e${e}o${q.patternData.EDGES.orientation[e]}`;
    if (best === null || key < best) best = key;
  }
  return best!;
}

describe("F2L cases", () => {
  it("are 41 distinct unsolved cases of the front-right pair", async () => {
    const keys = await Promise.all(F2L_KEYS.map((k) => f2lCaseKey(algs.get(k)!)));
    expect(keys).not.toContain("c4o0e8o0");
    expect(new Set(keys).size).toBe(41);
  });
});

describe("curriculum algorithms", () => {
  it("every algorithm is valid notation", () => {
    for (const [key, alg] of algs) expect(() => new Alg(alg), key).not.toThrow();
  });

  it.each([...algs.keys()].filter((k) => k in EXPECTATIONS))("%s solves the expected case", async (key) => {
    EXPECTATIONS[key](await profileAlg(algs.get(key)!));
  });

  it("every algorithm has an expectation (except the intentionally free ones)", () => {
    const free = ["ini-03-cantos-brancos/Gatilho sexy move", "ini-08-orientar-cantos/Orientação"];
    expect([...algs.keys()].filter((k) => !(k in EXPECTATIONS) && !free.includes(k))).toEqual([]);
  });

  it("the beginner trigger and corner twist algorithms have order 6", async () => {
    const solved = (await loadKPuzzle()).defaultPattern();
    for (const key of ["ini-03-cantos-brancos/Gatilho sexy move", "ini-08-orientar-cantos/Orientação"]) {
      const alg = algs.get(key)!;
      expect(solved.applyAlg(Array(6).fill(alg).join(" ")).experimentalIsSolved({ ignorePuzzleOrientation: false, ignoreCenterOrientation: true }), key).toBe(true);
    }
  });
});

describe("ao12TargetMs", () => {
  it("parses milestone goals", () => {
    const item = LEVELS[1].itens.find((i) => i.id === "int-07-sub-40")!;
    expect(ao12TargetMs(item)).toBe(40_000);
    expect(ao12TargetMs(LEVELS[0].itens[0])).toBeNull();
  });
});
