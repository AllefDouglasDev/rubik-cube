// Finds short <R,U,F> algorithms for the F2L cases (front-right slot) not covered by the curriculum.
// Usage: node scripts/f2l-search.mjs   (prints nothing new when all 41 cases are covered)
import { Alg } from "cubing/alg";
import { cube3x3x3 } from "cubing/puzzles";
import { readFile } from "node:fs/promises";
const kp = await cube3x3x3.kpuzzle();
const S = kp.defaultPattern();
const AUF = ["", "U", "U2", "U'"];
function classify(p) {
  const d = p.patternData;
  const ok = (o, idx) => idx.every((i) => d[o].pieces[i] === i && d[o].orientation[i] === 0);
  if (!ok("EDGES", [4, 5, 6, 7, 9, 10, 11]) || !ok("CORNERS", [5, 6, 7])) return null;
  const c = d.CORNERS.pieces.indexOf(4), e = d.EDGES.pieces.indexOf(8);
  if (![0, 1, 2, 3, 4].includes(c) || ![0, 1, 2, 3, 8].includes(e)) return null;
  let best = null;
  for (const a of AUF) {
    const q = a ? p.applyAlg(a) : p;
    const E = q.patternData.EDGES, C = q.patternData.CORNERS;
    const ci = C.pieces.indexOf(4), ei = E.pieces.indexOf(8);
    const key = `c${ci}o${C.orientation[ci]}e${ei}o${E.orientation[ei]}`;
    if (best === null || key < best) best = key;
  }
  return best === "c4o0e8o0" ? null : best;
}
const curriculum = JSON.parse(await readFile(new URL("../../docs/curriculum/avancado.json", import.meta.url), "utf8"));
const list = curriculum.itens.find((i) => i.id === "adv-03-f2l-casos").algoritmos.map((a) => a.alg);
const known = new Set(list.map((a) => classify(S.applyAlg(new Alg(a).invert()))).filter(Boolean));
console.log("known", known.size);
const MOVES = ["R", "R'", "R2", "U", "U'", "U2", "F", "F'", "F2"];
const found = new Map();
const t0 = Date.now();
function dfs(p, seq, depth) {
  if (depth === 0) {
    const k = classify(p);
    if (k && !known.has(k) && !found.has(k)) {
      // seq applied to solved gives the case's inverse; the solving alg is seq inverted.
      found.set(k, new Alg(seq.join(" ")).invert().toString());
      console.log("found", k, found.get(k), `${(Date.now() - t0) / 1000}s`);
    }
    return;
  }
  const last = seq.length ? seq[seq.length - 1][0] : "";
  for (const m of MOVES) {
    if (m[0] === last) continue;
    seq.push(m);
    dfs(p.applyMove(m), seq, depth - 1);
    seq.pop();
  }
}
for (let depth = 1; depth <= 11 && known.size + found.size < 41; depth++) {
  dfs(S, [], depth);
  console.log("depth", depth, "done", `${(Date.now() - t0) / 1000}s`, "total", known.size + found.size);
}
