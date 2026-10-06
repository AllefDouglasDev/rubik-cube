import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { FaceletCube, type Face } from "../analysis/facelets";
import { loadKPuzzle } from "../cube-state/cubeState";
import type { CubeColor } from "./classifier";
import { analyzeNet, netOf, netToPattern, setupAlgFor, stickerPosition } from "./cubeNet";

const SCHEME: Record<Face, CubeColor> = { U: "W", D: "Y", F: "G", B: "B", R: "R", L: "O" };
const netAfter = (alg: string) => netOf(FaceletCube.solved().apply(alg), SCHEME);

describe("scan layout", () => {
  it("places the stickers of each face on that face", () => {
    expect(stickerPosition("F", 0)).toEqual([-1, 1, 1]); // top-left of the front face
    expect(stickerPosition("U", 0)).toEqual([-1, 1, -1]); // top-left of U = back-left
    expect(stickerPosition("D", 0)).toEqual([-1, -1, 1]); // top-left of D = front-left
    expect(stickerPosition("R", 2)).toEqual([1, 1, -1]); // top-right of R = back
  });
});

describe("analyzeNet", () => {
  it("accepts the solved cube", () => {
    expect(analyzeNet(netAfter("")).problems).toEqual([]);
  });

  it("matches cubing.js for random scrambles", async () => {
    const kpuzzle = await loadKPuzzle();
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 40; i++) {
      const alg = Array.from({ length: 15 }, () => "UDRLFB"[Math.floor(rand() * 6)] + ["", "'", "2"][Math.floor(rand() * 3)]).join(" ");
      const expected = kpuzzle.defaultPattern().applyAlg(alg).patternData;
      const actual = (await netToPattern(netAfter(alg))).patternData;
      expect(actual.EDGES, alg).toEqual(expected.EDGES);
      expect(actual.CORNERS, alg).toEqual(expected.CORNERS);
    }
  });

  it("detects impossible states", () => {
    const twisted = netAfter("R U");
    // Twist one corner in place: rotate the three stickers of the UFR corner.
    const [u, f, r] = [twisted.U[8], twisted.F[2], twisted.R[0]];
    Object.assign(twisted.U, { 8: f });
    Object.assign(twisted.F, { 2: r });
    Object.assign(twisted.R, { 0: u });
    expect(analyzeNet(twisted).problems.map((p) => p.kind)).toEqual(["twist"]);

    const flipped = netAfter("");
    [flipped.U[7], flipped.F[1]] = [flipped.F[1], flipped.U[7]];
    expect(analyzeNet(flipped).problems.map((p) => p.kind)).toEqual(["flip"]);

    const swapped = netAfter("");
    // Swap two edges (UF and UR) keeping orientation: a single swap is a parity error.
    [swapped.U[7], swapped.U[5]] = [swapped.U[5], swapped.U[7]];
    [swapped.F[1], swapped.R[1]] = [swapped.R[1], swapped.F[1]];
    expect(analyzeNet(swapped).problems.map((p) => p.kind)).toEqual(["parity"]);

    const misread = netAfter("");
    misread.F[0] = "O"; // an orange sticker where a green one should be
    expect(analyzeNet(misread).problems.map((p) => p.kind)).toEqual(expect.arrayContaining(["count", "piece"]));
  });
});

describe("setupAlgFor", () => {
  it("reproduces the scanned state", async () => {
    const scramble = "R U2 F' L D2 B R' U F2 D' L2 B2";
    const setup = await setupAlgFor(netAfter(scramble));
    const kpuzzle = await loadKPuzzle();
    const a = kpuzzle.defaultPattern().applyAlg(new Alg(setup));
    const b = kpuzzle.defaultPattern().applyAlg(new Alg(scramble));
    expect(a.isIdentical(b)).toBe(true);
  });
});
