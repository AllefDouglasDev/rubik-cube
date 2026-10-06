import { useState } from "react";
import type { Session } from "../storage/db";
import type { Repo } from "../storage/repo";

interface Props {
  repo: Repo;
  sessions: Session[];
  sessionId: string;
  onSelect: (id: string) => void;
}

export function SessionBar({ repo, sessions, sessionId, onSelect }: Props) {
  const [confirming, setConfirming] = useState(false);

  const create = async () => {
    const session = await repo.createSession(`Sessão ${sessions.length + 1}`);
    onSelect(session.id);
  };

  const remove = async () => {
    await repo.deleteSession(sessionId);
    setConfirming(false);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    onSelect(remaining[0]?.id ?? (await repo.ensureSession()).id);
  };

  return (
    <div className="row session-bar">
      <select value={sessionId} onChange={(e) => onSelect(e.target.value)} aria-label="Sessão">
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={create}>
        Nova sessão
      </button>
      {confirming ? (
        <>
          <button type="button" className="danger" onClick={remove}>
            Apagar sessão e solves
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Apagar sessão
        </button>
      )}
    </div>
  );
}
