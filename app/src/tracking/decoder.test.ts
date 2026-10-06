import { describe, expect, it } from "vitest";
import { FaceletCube } from "../analysis/facelets";
import { MoveDecoder } from "./decoder";
import { applyMove, solvedState, stateFromCube, visibleFace } from "./stickerModel";

describe("stickerModel", () => {
  it("agrees with the facelet model", () => {
    const alg = "R U F' L2 D B' M E2 S'";
    let s = solvedState();
    for (const m of alg.split(" ")) s = applyMove(s, m);
    expect(Array.from(s)).toEqual(Array.from(stateFromCube(FaceletCube.solved().apply(alg))));
  });
});

function simulate(moves: string[], every = 1, noise?: (i: number, face: (number | null)[]) => void) {
  let state = solvedState();
  const decoder = new MoveDecoder(state);
  moves.forEach((m, i) => {
    state = applyMove(state, m);
    if ((i + 1) % every === 0 || i === moves.length - 1) {
      const face: (number | null)[] = visibleFace(state);
      noise?.(i, face);
      decoder.observe(face, i);
    }
  });
  return { decoder, state };
}

const sameState = (a: Uint8Array, b: Uint8Array) => a.join() === b.join();

describe("MoveDecoder", () => {
  it("decodes one visible move per observation", () => {
    const truth = "R U R' U' F2 L D' R2 U L' F D2".split(" ");
    const { decoder } = simulate(truth);
    expect(decoder.best().map((m) => m.m)).toEqual(truth);
  });

  it("decodes two moves between observations", () => {
    const truth = "R U R' U' F R2 L' D U2 F'".split(" ");
    const { decoder, state } = simulate(truth, 2);
    expect(sameState(decoder.bestState(), state)).toBe(true);
    expect(decoder.best().length).toBeLessThanOrEqual(truth.length);
  });

  it("infers a back-face turn once its effect reaches the front", () => {
    const truth = "R U B R' U'".split(" ");
    const { decoder, state } = simulate(truth);
    expect(sameState(decoder.bestState(), state)).toBe(true);
    expect(decoder.best().map((m) => m.m)).toContain("B");
  });

  it("tolerates occluded stickers and an occasional misread", () => {
    const truth = "R U R' U R U2 R' F' U' F".split(" ");
    const { decoder, state } = simulate(truth, 1, (i, face) => {
      face[(i * 2) % 9] = null; // a finger over one sticker
      face[(i + 4) % 9] = null;
      if (i === 3) face[8] = (face[8]! + 1) % 6; // one wrong color
    });
    expect(sameState(decoder.bestState(), state)).toBe(true);
    expect(decoder.best().map((m) => m.m)).toEqual(truth);
  });

  it("recovers a last back-face move from the known final state", () => {
    const truth = "R U R' B".split(" ");
    const { decoder, state } = simulate(truth);
    expect(decoder.best().map((m) => m.m)).toEqual(["R", "U", "R'"]); // B never reached the front
    const finished = decoder.finish(state, 99)!;
    expect(finished.map((m) => m.m)).toEqual(truth);
    expect(finished.at(-1)).toMatchObject({ inferred: true, t: 99 });
  });

  it("only confirms moves that every hypothesis agrees on", () => {
    const { decoder } = simulate(["R", "U"]);
    const confirmed = decoder.confirmed().map((m) => m.m);
    expect(["R", "U"].slice(0, confirmed.length)).toEqual(confirmed);
  });
});

// Simulated accuracy (F3.7 on synthetic data). The real-camera numbers come from the guided recordings.
function editDistance(a: string[], b: string[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function scenario(faces: string[], hiddenMax: number, misread: number, trials = 20) {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const moves = faces.flatMap((f) => [f, `${f}'`, `${f}2`]);
  let exactState = 0;
  let errors = 0;
  let total = 0;
  for (let trial = 0; trial < trials; trial++) {
    const truth: string[] = [];
    while (truth.length < 25) {
      const m = moves[Math.floor(rand() * moves.length)];
      if (truth.length && truth.at(-1)![0] === m[0]) continue;
      truth.push(m);
    }
    let state = solvedState();
    const decoder = new MoveDecoder(state);
    for (const m of truth) {
      state = applyMove(state, m);
      const face: (number | null)[] = visibleFace(state);
      const hidden = Math.floor(rand() * (hiddenMax + 1));
      for (let k = 0; k < hidden; k++) face[Math.floor(rand() * 9)] = null;
      for (let k = 0; k < 9; k++) if (face[k] !== null && rand() < misread) face[k] = (face[k]! + 1 + Math.floor(rand() * 5)) % 6;
      decoder.observe(face, 0);
    }
    if (decoder.bestState().join() === state.join()) exactState++;
    errors += editDistance(decoder.best().map((d) => d.m), truth);
    total += truth.length;
  }
  return { stateAccuracy: exactState / trials, moveAccuracy: 1 - errors / total };
}

describe("MoveDecoder under noise (simulated)", () => {
  // 0–3 stickers hidden by fingers and 3% misread stickers per observation; one observation per move.
  it("decodes visible-face moves (U D R L F) with ≥95% per-move accuracy", () => {
    const r = scenario(["U", "D", "R", "L", "F"], 3, 0.03);
    console.log(`U D R L F com ruído: estado final ${(r.stateAccuracy * 100).toFixed(0)}%, por giro ${(r.moveAccuracy * 100).toFixed(1)}%`);
    expect(r.moveAccuracy).toBeGreaterThanOrEqual(0.95);
   }, 60_000);

  it("infers back-face moves on clean observations", () => {
    const r = scenario(["U", "D", "R", "L", "F", "B"], 0, 0);
    console.log(`com B, sem ruído: estado final ${(r.stateAccuracy * 100).toFixed(0)}%, por giro ${(r.moveAccuracy * 100).toFixed(1)}%`);
    expect(r.stateAccuracy).toBeGreaterThanOrEqual(0.85);
   }, 60_000);

  it("documents the limit: back-face moves plus noise (one face visible)", () => {
    const r = scenario(["U", "D", "R", "L", "F", "B"], 3, 0.03);
    console.log(`com B e ruído: estado final ${(r.stateAccuracy * 100).toFixed(0)}%, por giro ${(r.moveAccuracy * 100).toFixed(1)}%`);
    expect(r.moveAccuracy).toBeGreaterThan(0);
   }, 60_000);
});
