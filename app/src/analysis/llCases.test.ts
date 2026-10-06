import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { FaceletCube } from "./facelets";
import { profileAlg } from "../curriculum/caseProfile";
import { OLL_ALGS, OLL_CORNER_ALGS, PLL_ALGS, crossDown, pllKey, recognizeOll, recognizePll } from "./llCases";

const solved = FaceletCube.solved();
const caseOf = (alg: string) => solved.apply(new Alg(alg).invert());

describe("PLL table", () => {
  it.each(Object.entries(PLL_ALGS))("%s keeps F2L, orientation and centers", (_, alg) => {
    const c = caseOf(alg);
    expect(c.f2lSolved("D")).toBe(true);
    expect(c.lastLayerOriented("D")).toBe(true);
    expect(c.centerColor("U")).toBe("U");
    expect(c.centerColor("F")).toBe("F");
    expect(c.isSolved()).toBe(false);
  });

  // Ties each name to its family: corners/edges out of place (best AUF) and sides with "headlights".
  const FAMILY: Record<string, string> = {
    Aa: "c3 e0 h1", Ab: "c3 e0 h1", E: "c4 e0 h0",
    H: "c0 e4 h4", Z: "c0 e4 h4", Ua: "c0 e3 h4", Ub: "c0 e3 h4",
    T: "c2 e2 h1", F: "c2 e2 h1", Ja: "c2 e2 h1", Jb: "c2 e2 h1", Ra: "c2 e2 h1", Rb: "c2 e2 h1",
    Na: "c2 e2 h0", Nb: "c2 e2 h0", V: "c2 e2 h0", Y: "c2 e2 h0",
    Ga: "c2 e4 h1", Gb: "c2 e4 h1", Gc: "c2 e4 h1", Gd: "c2 e4 h1",
  };
  it.each(Object.keys(PLL_ALGS))("%s belongs to its family", async (name) => {
    const p = await profileAlg(PLL_ALGS[name]);
    const c = caseOf(PLL_ALGS[name]);
    const sides = [
      [[-1, 1, 1], [1, 1, 1], "F"],
      [[1, 1, 1], [1, 1, -1], "R"],
      [[1, 1, -1], [-1, 1, -1], "B"],
      [[-1, 1, -1], [-1, 1, 1], "L"],
    ] as const;
    const headlights = sides.filter(([a, b, f]) => c.colorAt([...a], f) === c.colorAt([...b], f)).length;
    expect(`c${p.cornersOutOfPlace} e${p.edgesOutOfPlace} h${headlights}`).toBe(FAMILY[name]);
  });

  it("has 21 distinct cases", () => {
    expect(new Set(Object.values(PLL_ALGS).map((a) => pllKey(caseOf(a)))).size).toBe(21);
  });

  it("recognises every case, from any AUF and viewing side", () => {
    for (const [name, alg] of Object.entries(PLL_ALGS)) {
      for (const pre of ["", "U", "y", "U2 y'", "y2 U'"]) {
        expect(recognizePll(solved.apply(new Alg(`${pre} ${new Alg(alg).invert()}`.trim()))), `${name} ${pre}`).toBe(name);
      }
    }
  });

  it("pairs each a/b case with its inverse where the names say so", () => {
    // Aa/Ab and Ua/Ub are 3-cycles in opposite directions: the inverse of one is the other.
    for (const [a, b] of [
      ["Aa", "Ab"],
      ["Ua", "Ub"],
      ["Ga", "Gb"],
      ["Gc", "Gd"],
    ]) {
      expect(recognizePll(solved.apply(PLL_ALGS[a]))).toBe(b);
    }
  });

  it("reports a skip on an AUF-only last layer", () => {
    expect(recognizePll(solved.apply("U2"))).toBe("skip");
  });
});

describe("OLL recognition", () => {
  it.each(Object.keys(OLL_CORNER_ALGS))("recognises the %s corner case", (name) => {
    expect(recognizeOll(caseOf(OLL_CORNER_ALGS[name]).apply("U"))).toMatchObject({ edges: "cruz", corners: name });
  });

  it("has 57 distinct numbered cases, recognised from any AUF", () => {
    const numbers = Object.keys(OLL_ALGS);
    expect(numbers).toHaveLength(57);
    for (const n of numbers) {
      for (const pre of ["", "U", "y2 U'"]) {
        expect(recognizeOll(solved.apply(new Alg(`${pre} ${new Alg(OLL_ALGS[n]).invert()}`.trim()))).number, `${n} ${pre}`).toBe(n);
      }
    }
  });

  it("numbers the corner cases (OCLL) as the 2-look names say", () => {
    const OCLL: Record<string, string> = { "OLL 21": "H", "OLL 22": "Pi", "OLL 23": "Headlights", "OLL 24": "T", "OLL 25": "Bowtie", "OLL 26": "Antisune", "OLL 27": "Sune" };
    for (const [n, name] of Object.entries(OCLL)) expect(recognizeOll(caseOf(OLL_ALGS[n])).corners, n).toBe(name);
  });

  it("names the edge shapes", () => {
    expect(recognizeOll(caseOf("F R U R' U' F'")).edges).toBe("linha");
    expect(recognizeOll(caseOf("f R U R' U' f'")).edges).toBe("L");
    expect(recognizeOll(caseOf("F R U R' U' F' f R U R' U' f'")).edges).toBe("ponto");
  });
});

describe("crossDown", () => {
  it("turns the cube so the cross color is on D", () => {
    const upsideDown = solved.apply("x2");
    expect(crossDown(upsideDown, "D").faceOfColor("D")).toBe("D");
    expect(crossDown(solved.apply("z"), "F").faceOfColor("F")).toBe("D");
  });
});
