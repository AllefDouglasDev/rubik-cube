// Session dropdown (number in front, creation date as secondary text) and the "new session" button.
import { useEffect, useRef, useState } from "react";
import type { SoloSession } from "./soloDb";

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
export const formatDate = (ms: number) => DATE.format(ms);

interface Props {
  sessions: SoloSession[]; // newest first
  sessionId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function SessionPicker({ sessions, sessionId, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.code === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="session-picker" ref={root}>
      <div className="row">
        <button type="button" className="session-current" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
          {current && <SessionLabel session={current} />}
          <span className="caret" aria-hidden>
            ▾
          </span>
        </button>
        <button type="button" onClick={onCreate}>
          Nova sessão
        </button>
      </div>
      {open && (
        <ul className="session-list" role="listbox" aria-label="Sessões">
          {sessions.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === sessionId}>
              <button
                type="button"
                className={s.id === sessionId ? "active" : ""}
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
              >
                <SessionLabel session={s} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionLabel({ session }: { session: SoloSession }) {
  return (
    <>
      <span className="session-number">#{session.number}</span>
      <span className="session-date" title={`Criada em ${formatDate(session.createdAt)}`}>
        {formatDate(session.createdAt)}
      </span>
    </>
  );
}
