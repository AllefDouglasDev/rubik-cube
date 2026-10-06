// Manual move entry for the virtual cube: face buttons and an algorithm field.
import { useState } from "react";
import { parseAlg } from "../cube-state/cubeState";

const FACES = ["U", "D", "R", "L", "F", "B"];
const SUFFIXES = ["", "'", "2"];

interface Props {
  onMoves: (alg: string) => void;
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
}

export function MovePad({ onMoves, onUndo, onReset, canUndo }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const alg = parseAlg(text);
    if (!alg || !text.trim()) {
      setError("Notação inválida.");
      return;
    }
    try {
      onMoves(alg.toString());
      setText("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Movimento inválido.");
    }
  };

  return (
    <div className="move-pad">
      <div className="move-grid">
        {FACES.flatMap((f) =>
          SUFFIXES.map((s) => (
            <button key={f + s} type="button" onClick={() => onMoves(f + s)}>
              {f + s}
            </button>
          )),
        )}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="R U R' U'" aria-label="Algoritmo" />
        <button type="submit">Aplicar</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Desfazer
        </button>
        <button type="button" onClick={onReset} disabled={!canUndo}>
          Voltar ao scramble
        </button>
      </div>
    </div>
  );
}
