// 3D cube rendered by cubing.js <twisty-player>. Shows `setup` (the scramble) plus moves added through the handle.
import type { TwistyPlayer } from "cubing/twisty";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

export interface CubeViewHandle {
  addMove(move: string): void;
  undo(): void;
  reset(): void;
}

interface Props {
  setup: string;
  // Optional algorithm to play after the setup, with the playback controls shown.
  alg?: string;
  ref?: Ref<CubeViewHandle>;
}

export function CubeView({ setup, alg, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<TwistyPlayer | null>(null);
  const initial = useRef({ setup, alg });
  initial.current = { setup, alg };

  useEffect(() => {
    let disposed = false;
    import("cubing/twisty").then(({ TwistyPlayer }) => {
      if (disposed || !container.current) return;
      const p = new TwistyPlayer({
        puzzle: "3x3x3",
        experimentalSetupAlg: initial.current.setup,
        alg: initial.current.alg ?? "",
        background: "none",
        controlPanel: initial.current.alg === undefined ? "none" : "bottom-row",
        visualization: "3D",
        hintFacelets: "floating",
        tempoScale: 2.5,
      });
      p.style.width = "100%";
      p.style.height = "100%";
      container.current.appendChild(p);
      player.current = p;
    });
    return () => {
      disposed = true;
      player.current?.remove();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!player.current) return;
    player.current.experimentalSetupAlg = setup;
    player.current.alg = alg ?? "";
  }, [setup, alg]);

  useImperativeHandle(ref, () => ({
    addMove: (move) => player.current?.experimentalAddMove(move),
    undo: () => player.current?.experimentalRemoveFinalChild(),
    reset: () => {
      if (player.current) player.current.alg = "";
    },
  }));

  return <div className="cube-view" ref={container} aria-label="Cubo 3D" />;
}
