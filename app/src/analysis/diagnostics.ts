// F4.3: tips computed from a stage analysis. Thresholds come from docs/03-solvers-e-analise.md.
import type { SolveAnalysis, Stage } from "./stages";

export interface Tip {
  id: string;
  level: "good" | "warn" | "info";
  title: string;
  detail: string;
}

export const THRESHOLDS = {
  crossMaxMoves: 8, // any cross can be solved in 8 moves or fewer
  crossMaxMs: 5000,
  pairMaxMoves: 12,
  pauseMs: 1000, // gap between two moves during F2L that counts as a lookahead pause
  maxRotations: 4,
  recognitionMaxMs: 1000,
  cfopMaxMoves: 70,
  // Typical share of the solve time per stage (upper bounds, %).
  shareMax: { cross: 15, f2l: 55, oll: 20, pll: 20 } as Record<string, number>,
};

const PAIR_LABEL: Record<string, string> = { f2l1: "1º par", f2l2: "2º par", f2l3: "3º par", f2l4: "4º par" };
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export function diagnose(analysis: SolveAnalysis, moveTimes?: number[]): Tip[] {
  const tips: Tip[] = [];
  const stage = (name: string) => analysis.stages.find((s) => s.name === name);
  const pairs = analysis.stages.filter((s) => s.name.startsWith("f2l"));
  const cross = stage("cross");

  if (!analysis.crossColor || !cross) {
    return [{ id: "no-cross", level: "info", title: "Etapas não identificadas", detail: "Nenhuma cruz foi montada nesta sequência." }];
  }

  if (cross.moveCount > THRESHOLDS.crossMaxMoves) {
    tips.push({
      id: "cross-moves",
      level: "warn",
      title: `Cruz com ${cross.moveCount} movimentos`,
      detail: `Toda cruz sai em ${THRESHOLDS.crossMaxMoves} movimentos ou menos (média ótima ≈ 6). Planeje a cruz inteira na inspeção.`,
    });
  } else {
    tips.push({ id: "cross-moves", level: "good", title: `Cruz eficiente (${cross.moveCount} movimentos)`, detail: "Dentro do limite de 8 movimentos." });
  }
  if (analysis.timed && cross.endMs !== undefined && cross.endMs > THRESHOLDS.crossMaxMs) {
    tips.push({ id: "cross-time", level: "warn", title: `Cruz levou ${seconds(cross.endMs)}`, detail: "A meta é menos de 3–5 s. Treine a cruz com inspeção cronometrada." });
  }

  const longPairs = pairs.filter((p) => !p.skipped && p.moveCount > THRESHOLDS.pairMaxMoves);
  if (longPairs.length) {
    tips.push({
      id: "pair-moves",
      level: "warn",
      title: `Pares longos: ${longPairs.map((p) => `${PAIR_LABEL[p.name]} (${p.moveCount})`).join(", ")}`,
      detail: `Um par bem resolvido leva cerca de 7–8 movimentos; acima de ${THRESHOLDS.pairMaxMoves} indica caso desconhecido ou par desfeito no caminho.`,
    });
  }

  const f2lRotations = pairs.reduce((a, p) => a + p.rotations, 0);
  if (analysis.rotations > THRESHOLDS.maxRotations) {
    tips.push({
      id: "rotations",
      level: "warn",
      title: `${analysis.rotations} rotações do cubo (${f2lRotations} no F2L)`,
      detail: "Rotações custam tempo e quebram o lookahead. Aprenda inserções nos slots de trás.",
    });
  }

  if (analysis.timed && moveTimes) {
    const f2lFrom = pairs[0]?.from ?? cross.to;
    const f2lTo = pairs.at(-1)?.to ?? cross.to;
    const gaps: number[] = [];
    for (let i = Math.max(1, f2lFrom); i < f2lTo; i++) gaps.push(moveTimes[i] - moveTimes[i - 1]);
    const pauses = gaps.filter((g) => g >= THRESHOLDS.pauseMs);
    if (pauses.length) {
      tips.push({
        id: "lookahead",
        level: "warn",
        title: `${pauses.length} pausa${pauses.length > 1 ? "s" : ""} no F2L (maior: ${seconds(Math.max(...pauses))})`,
        detail: "Pausas longas entre pares indicam lookahead fraco. Gire mais devagar e procure o próximo par enquanto resolve o atual.",
      });
    }

    for (const name of ["oll", "pll"]) {
      const s = stage(name);
      if (s && !s.skipped && (s.recognitionMs ?? 0) > THRESHOLDS.recognitionMaxMs) {
        tips.push({
          id: `${name}-recognition`,
          level: "warn",
          title: `Reconhecimento do ${name.toUpperCase()}: ${seconds(s.recognitionMs!)}`,
          detail: "Acima de 1 s. Treine o reconhecimento dos casos no trainer.",
        });
      }
    }

    const total = analysis.stages.at(-1)?.endMs ?? 0;
    if (total > 0) {
      const share = (stages: (Stage | undefined)[]) =>
        (100 * stages.reduce((a, s) => a + (s && s.endMs !== undefined && s.startMs !== undefined ? s.endMs - s.startMs : 0), 0)) / total;
      const shares: Record<string, number> = { cross: share([cross]), f2l: share(pairs), oll: share([stage("oll")]), pll: share([stage("pll")]) };
      const worst = Object.entries(shares)
        .filter(([k, v]) => v > THRESHOLDS.shareMax[k] + 10)
        .sort((a, b) => b[1] - THRESHOLDS.shareMax[b[0]] - (a[1] - THRESHOLDS.shareMax[a[0]]))[0];
      if (worst) {
        tips.push({
          id: "stage-share",
          level: "warn",
          title: `${worst[0].toUpperCase()} ocupou ${Math.round(worst[1])}% do tempo`,
          detail: `O típico é até ${THRESHOLDS.shareMax[worst[0]]}%. É a etapa que mais vai render no treino.`,
        });
      }
    }

    const turning = analysis.stages.reduce((a, s) => a + (s.executionMs ?? 0), 0);
    if (turning > 0) {
      const tps = analysis.moveCount / (turning / 1000);
      tips.push({ id: "tps", level: "info", title: `TPS de execução: ${tps.toFixed(1)}`, detail: "Movimentos por segundo girando, sem contar o reconhecimento. Intermediário: 3–5; avançado: 8+." });
    }
  }

  if (analysis.solved && analysis.moveCount > THRESHOLDS.cfopMaxMoves) {
    tips.push({
      id: "total-moves",
      level: "warn",
      title: `${analysis.moveCount} movimentos no total`,
      detail: `Acima de ${THRESHOLDS.cfopMaxMoves} no CFOP costuma indicar F2L ineficiente.`,
    });
  }

  for (const name of ["oll", "pll"]) {
    if (stage(name)?.skipped) tips.push({ id: `${name}-skip`, level: "good", title: `${name.toUpperCase()} skip`, detail: "A etapa já estava resolvida." });
  }
  if (!analysis.solved) {
    tips.push({ id: "unsolved", level: "info", title: "Solve incompleto", detail: `Última etapa alcançada: ${analysis.stages.at(-1)?.name ?? "nenhuma"}.` });
  }
  return tips;
}
