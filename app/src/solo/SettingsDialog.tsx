// Backup of every session as structured JSON: export (copy or download) and import (file or pasted text).
import { useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import type { SoloRepo } from "./soloDb";

type Tab = "export" | "import";
type Status = { kind: "ok" | "error"; text: string } | null;

export function SettingsDialog({ repo, onClose }: { repo: SoloRepo; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("export");
  return (
    <Dialog title="Configurações" onClose={onClose} className="settings-dialog">
      <div className="tabs" role="tablist">
        {(
          [
            ["export", "Exportar"],
            ["import", "Importar"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "export" ? <ExportTab repo={repo} /> : <ImportTab repo={repo} />}
    </Dialog>
  );
}

function ExportTab({ repo }: { repo: SoloRepo }) {
  const [json, setJson] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    repo.exportData().then((data) => setJson(JSON.stringify(data, null, 2)));
  }, [repo]);

  const copy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setStatus({ kind: "ok", text: "JSON copiado." });
    } catch {
      setStatus({ kind: "error", text: "Não foi possível copiar. Selecione o texto e copie manualmente." });
    }
  };

  const download = () => {
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cubo-solo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "ok", text: "Download iniciado." });
  };

  return (
    <div className="settings-tab">
      <textarea readOnly value={json ?? "Gerando…"} aria-label="JSON exportado" rows={14} />
      <div className="row">
        <button type="button" onClick={copy} disabled={!json}>
          Copiar JSON
        </button>
        <button type="button" onClick={download} disabled={!json}>
          Baixar JSON
        </button>
        {status && <span className={status.kind === "error" ? "error" : "muted"}>{status.text}</span>}
      </div>
    </div>
  );
}

function ImportTab({ repo }: { repo: SoloRepo }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setStatus(null);
  };

  const importText = async () => {
    setBusy(true);
    try {
      const result = await repo.importData(text);
      setStatus({ kind: "ok", text: `Importadas ${result.sessions} sessões, ${result.solves} solves e o progresso de ${result.algProgress} casos.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-tab">
      <label>
        Arquivo
        <input type="file" accept="application/json,.json" onChange={(e) => readFile(e.target.files?.[0])} />
      </label>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus(null);
        }}
        placeholder="…ou cole aqui o conteúdo do JSON"
        aria-label="JSON para importar"
        rows={12}
      />
      <p className="muted">Sessões e solves são mesclados pelo id: importar o mesmo arquivo de novo não duplica nada.</p>
      <div className="row">
        <button type="button" onClick={importText} disabled={!text.trim() || busy}>
          Importar
        </button>
        {status && <span className={status.kind === "error" ? "error" : "muted"}>{status.text}</span>}
      </div>
    </div>
  );
}
