// F2L, OLL and PLL cases to study, taken from the curriculum (docs/curriculum/avancado.json). Each case is
// shown from the start position (white on the bottom, green in front), so the last layer is yellow on top.
import { Alg } from "cubing/alg";
import { FACES, FACE_NORMAL, type Face, FaceletCube } from "../../analysis/facelets";
import { fromStartPosition } from "../../cube-state/orientation";
import { LEVELS } from "../../curriculum/curriculum";
import type { CubeColor } from "../../vision/classifier";
import { type CubeNet, STANDARD_SCHEME, netOf, stickerPosition } from "../../vision/cubeNet";

export type CaseSet = "f2l" | "oll" | "pll";

export const SET_INFO: Record<CaseSet, { itemId: string; title: string; hint: string }> = {
  f2l: {
    itemId: "adv-03-f2l-casos",
    title: "F2L",
    hint: "Par canto + aresta para o slot da frente-direita, com a cruz branca embaixo. Ache o par, posicione com U e insira.",
  },
  oll: {
    itemId: "adv-02-oll-completo",
    title: "OLL",
    hint: "Primeiras duas camadas prontas. Reconheça o desenho do amarelo em cima (incluindo as laterais) e oriente a última camada.",
  },
  pll: {
    itemId: "adv-01-pll-completo",
    title: "PLL",
    hint: "Amarelo todo em cima. Reconheça pelas laterais (faróis, blocos e barras) e permute a última camada.",
  },
};

export interface StudyCase {
  key: string; // "<set>/<name>", stable id for the progress
  set: CaseSet;
  name: string;
  alg: string;
  setup: string; // from the start position (rotation included), reaches the case
}

export function casesOf(set: CaseSet): StudyCase[] {
  const item = LEVELS.flatMap((l) => l.itens).find((i) => i.id === SET_INFO[set].itemId);
  if (!item) throw new Error(`Item do currículo não encontrado: ${SET_INFO[set].itemId}`);
  return item.algoritmos.map(({ nome, alg }) => ({
    key: `${set}/${nome}`,
    set,
    name: nome,
    alg,
    setup: fromStartPosition(new Alg(alg).invert().toString()),
  }));
}

// The case as seen from the start position (faces read like the scramble preview net).
export function caseNet(c: StudyCase): CubeNet {
  return netOf(FaceletCube.solved().apply(c.setup), STANDARD_SCHEME);
}

// Top view of the last layer: U face plus the top row of each side, in screen order.
export interface LastLayerView {
  u: CubeColor[]; // 9, row 0 = back
  back: CubeColor[]; // 3, left to right on screen
  front: CubeColor[];
  left: CubeColor[]; // 3, top (back) to bottom (front)
  right: CubeColor[];
}

export function lastLayerView(net: CubeNet): LastLayerView {
  // netOf reads each side from outside with U up; see AXES in vision/cubeNet.ts.
  return {
    u: net.U,
    back: [net.B[2], net.B[1], net.B[0]],
    front: [net.F[0], net.F[1], net.F[2]],
    left: [net.L[0], net.L[1], net.L[2]],
    right: [net.R[2], net.R[1], net.R[0]],
  };
}

// The front-right pair in the start position: white-green-orange corner and green-orange edge. Stickers are
// named by the face they started on (STANDARD_SCHEME), and after the z2 start rotation green is still F,
// orange (L) is on the right and white (U) is on the bottom.
const PAIR_CORNER = ["F", "L", "U"];
const PAIR_EDGE = ["F", "L"];

// For F2L pictures: which stickers belong to the pair (or are centers); the rest is drawn gray.
export function f2lHighlight(c: StudyCase): Record<Face, boolean[]> {
  const cube = FaceletCube.solved().apply(c.setup);
  const highlight = {} as Record<Face, boolean[]>;
  for (const face of FACES) {
    highlight[face] = Array.from({ length: 9 }, (_, i) => {
      const pos = stickerPosition(face, i);
      const faces = FACES.filter((f) => FACE_NORMAL[f].some((n, k) => n !== 0 && n === pos[k]));
      if (faces.length === 1) return true; // center
      const colors = faces.map((f) => cube.colorAt(pos, f)).sort();
      const target = (faces.length === 3 ? PAIR_CORNER : PAIR_EDGE).slice().sort();
      return colors.join() === target.join();
    });
  }
  return highlight;
}
