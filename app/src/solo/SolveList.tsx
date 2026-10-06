// Session summary (current/best of time, mo3, ao5, ao12) and the solves, newest first, with a two-click delete.
import { useEffect, useMemo, useState } from "react";
import { type SessionStats, averageOf, formatTime, meanOf } from "../stats/stats";
import { formatDate } from "./SessionPicker";
import type { SoloSolve } from "./soloDb";

const minOf = (values: (number | null)[]) => {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? Math.min(...valid) : null;
};

export function SessionSummary({ solves, stats }: { solves: SoloSolve[]; stats: SessionStats }) {
  const mo3s = useMemo(() => solves.map((_, i) => meanOf(solves.slice(0, i + 1), 3)), [solves]);
  const rows: [string, number | null, number | null][] = [
    ["tempo", solves.at(-1)?.timeMs ?? null, stats.best],
    ["mo3", stats.mo3, minOf(mo3s)],
    ["ao5", stats.ao5, stats.bestAo5],
    ["ao12", stats.ao12, stats.bestAo12],
  ];
  return (
    <section className="solo-summary">
      <table>
        <thead>
          <tr>
            <th />
            <th>atual</th>
            <th>melhor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, current, best]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{formatTime(current)}</td>
              <td>{formatTime(best)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>{stats.count}</strong> solves · média <strong>{formatTime(stats.mean)}</strong>
      </p>
    </section>
  );
}

interface ListProps {
  solves: SoloSolve[]; // oldest first
  best: number | null;
  onDelete: (id: string) => void;
}

export function SolveList({ solves, best, onDelete }: ListProps) {
  const rows = useMemo(
    () => solves.map((s, i) => ({ solve: s, n: i + 1, ao5: averageOf(solves.slice(0, i + 1), 5), ao12: averageOf(solves.slice(0, i + 1), 12) })).reverse(),
    [solves],
  );
  if (!solves.length) return <p className="muted solo-empty">Nenhum tempo nesta sessão ainda.</p>;
  return (
    <table className="solve-list">
      <thead>
        <tr>
          <th>#</th>
          <th>tempo</th>
          <th>ao5</th>
          <th>ao12</th>
          <th>
            <span className="sr-only">Apagar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ solve, n, ao5, ao12 }) => (
          <tr key={solve.id} title={`${formatDate(solve.createdAt)}\n${solve.scramble}`}>
            <td className="muted">{n}</td>
            <td className={solve.timeMs === best ? "best" : ""}>{formatTime(solve.timeMs)}</td>
            <td>{formatTime(ao5)}</td>
            <td>{formatTime(ao12)}</td>
            <td>
              <DeleteButton onConfirm={() => onDelete(solve.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// First click arms ("Tem certeza?"), second deletes. Disarms after 3 s or when focus leaves.
function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      className={`delete-button ${armed ? "danger armed" : ""}`}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? "Confirmar exclusão" : "Apagar tempo"}
    >
      {armed ? "Tem certeza?" : "Apagar"}
    </button>
  );
}
