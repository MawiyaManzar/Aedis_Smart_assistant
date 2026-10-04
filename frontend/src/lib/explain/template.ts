import { ExplainFacts } from "./types";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const sourceNote = (f: ExplainFacts) =>
  f.scoreSource === "HEURISTIC"
    ? "This score comes from the rule-based calculation, not the ML model."
    : "";

/**
 * Deterministic explanation built only from the supplied facts. It is the fallback whenever the
 * LLM is unavailable, misconfigured, or returns text that fails number validation.
 */
export function templateExplanation(f: ExplainFacts): string {
  const noun = f.kind === "FRAUD" ? "fraud risk" : "loan distress";
  const thing = f.kind === "FRAUD" ? "transaction" : "borrower";

  if (f.score === null) {
    return `No valid ${noun} score is available for this ${thing} right now, so no explanation can be given. ${sourceNote(f)}`.trim();
  }

  const parts: string[] = [];
  parts.push(
    `The ${noun} score for ${f.entityId} is ${f.score}/100 (${f.riskLevel}), and its current status is ${f.status}.`
  );
  parts.push(`Scale: ${f.scale}`);

  const raising = f.drivers.filter((d) => d.impact > 0).sort((a, b) => b.impact - a.impact);
  const lowering = f.drivers.filter((d) => d.impact < 0).sort((a, b) => a.impact - b.impact);
  if (raising.length > 0) {
    parts.push(
      `What pushed the score up: ${raising
        .map((d) => `${d.description} (${signed(d.impact)})`)
        .join("; ")}.`
    );
  }
  if (lowering.length > 0) {
    parts.push(
      `What pulled it down: ${lowering
        .map((d) => `${d.description} (${signed(d.impact)})`)
        .join("; ")}.`
    );
  }
  if (f.drivers.length === 0) {
    parts.push("No contributing factors were reported with this score.");
  }

  if (f.metrics.length > 0) {
    parts.push(`Key figures: ${f.metrics.map((m) => `${m.label} ${m.value}`).join("; ")}.`);
  }
  const note = sourceNote(f);
  if (note) parts.push(note);
  return parts.join(" ");
}
