// Unfolded cube (U on top, L F R B in the middle row, D below). Clicking a sticker cycles its color.
import type { Face } from "../analysis/facelets";
import { COLORS, COLOR_INFO, type CubeColor } from "../vision/classifier";
import type { CubeNet } from "../vision/cubeNet";

const LAYOUT: { face: Face; col: number; row: number }[] = [
  { face: "U", col: 1, row: 0 },
  { face: "L", col: 0, row: 1 },
  { face: "F", col: 1, row: 1 },
  { face: "R", col: 2, row: 1 },
  { face: "B", col: 3, row: 1 },
  { face: "D", col: 1, row: 2 },
];

interface Props {
  net: Partial<CubeNet>;
  onChange?: (face: Face, index: number, color: CubeColor) => void;
}

export function NetView({ net, onChange }: Props) {
  return (
    <div className="net" role="img" aria-label="Planificação do cubo">
      {LAYOUT.map(({ face, col, row }) => (
        <div key={face} className="net-face" style={{ gridColumn: col + 1, gridRow: row + 1 }}>
          {Array.from({ length: 9 }, (_, i) => {
            const color = net[face]?.[i];
            return (
              <button
                key={i}
                type="button"
                className="net-sticker"
                style={{ background: color ? COLOR_INFO[color].swatch : "transparent" }}
                disabled={!color || !onChange || i === 4}
                title={color ? `${COLOR_INFO[color].name}${i === 4 ? " (centro)" : " · clique para trocar"}` : "ainda não escaneado"}
                onClick={() => color && onChange?.(face, i, COLORS[(COLORS.indexOf(color) + 1) % COLORS.length])}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
