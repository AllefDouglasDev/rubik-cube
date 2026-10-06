// The scramble on a virtual cube: the 3D player starts from the start position and plays the scramble, and
// the net shows how each face should look at the end.
import { useMemo } from "react";
import { FaceletCube } from "../analysis/facelets";
import { START_ROTATION, START_SCHEME, fromStartPosition } from "../cube-state/orientation";
import { CubeView } from "../renderer/CubeView";
import { COLOR_INFO } from "../vision/classifier";
import { STANDARD_SCHEME, netOf } from "../vision/cubeNet";
import { Dialog } from "./Dialog";
import { NetView } from "./NetView";

// How to hold the solved cube before applying the scramble (see cube-state/orientation.ts).
export function StartPosition() {
  const chip = (face: "D" | "F") => (
    <span className="color-chip">
      <span className="swatch" style={{ background: COLOR_INFO[START_SCHEME[face]].swatch }} />
      {COLOR_INFO[START_SCHEME[face]].name.toLowerCase()}
    </span>
  );
  return (
    <span className="start-position">
      Posição inicial: {chip("D")} embaixo, {chip("F")} na frente
    </span>
  );
}

export function ScramblePreviewDialog({ scramble, onClose }: { scramble: string; onClose: () => void }) {
  const net = useMemo(() => netOf(FaceletCube.solved().apply(fromStartPosition(scramble)), STANDARD_SCHEME), [scramble]);
  return (
    <Dialog title="Embaralhamento no cubo virtual" onClose={onClose} className="preview-dialog">
      <p className="preview-scramble">{scramble}</p>
      <StartPosition />
      <div className="preview-views">
        <figure>
          <div className="preview-cube">
            <CubeView setup={START_ROTATION} alg={scramble} />
          </div>
          <figcaption className="muted">Use os controles para ver cada giro a partir da posição inicial (resolvido, branco embaixo e verde na frente).</figcaption>
        </figure>
        <figure>
          <div className="preview-net">
            <NetView net={net} />
          </div>
          <figcaption className="muted">Como cada face deve ficar no fim. No meio, da esquerda para a direita: L, F, R e B; U fica acima de F e D abaixo.</figcaption>
        </figure>
      </div>
    </Dialog>
  );
}
