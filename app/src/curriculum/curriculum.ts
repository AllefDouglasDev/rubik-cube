// Curriculum content lives in docs/curriculum/*.json (the source of truth); progress lives in IndexedDB.
import avancado from "../../../docs/curriculum/avancado.json";
import iniciante from "../../../docs/curriculum/iniciante.json";
import intermediario from "../../../docs/curriculum/intermediario.json";

export interface CurriculumAlg {
  nome: string;
  alg: string;
}

export interface CurriculumItem {
  id: string;
  titulo: string;
  etapa: string;
  descricao: string;
  algoritmos: CurriculumAlg[];
  meta: string;
  quantidadeCasos?: number;
}

export interface CurriculumLevel {
  nivel: string;
  titulo: string;
  meta: { mediaAlvoMs: number; movimentosTipicos: string };
  aviso?: string;
  fontes: string[];
  itens: CurriculumItem[];
}

export const LEVELS: CurriculumLevel[] = [iniciante, intermediario, avancado] as CurriculumLevel[];

export type ProgressStatus = "nao-iniciado" | "aprendendo" | "aprendido" | "dominado";

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  "nao-iniciado": "Não iniciado",
  aprendendo: "Aprendendo",
  aprendido: "Aprendido",
  dominado: "Dominado",
};

// Milestones written as "ao12 < 40 s" are checked automatically against the best ao12.
export function ao12TargetMs(item: CurriculumItem): number | null {
  const match = /ao12\s*<\s*(\d+(?:[.,]\d+)?)\s*s/.exec(item.meta);
  return match ? Number(match[1].replace(",", ".")) * 1000 : null;
}

export function isDone(status: ProgressStatus | undefined): boolean {
  return status === "aprendido" || status === "dominado";
}
