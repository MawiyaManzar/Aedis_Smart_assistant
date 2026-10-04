import { ExplainFacts } from "./types";

const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;

const normalise = (token: string): string => {
  const n = Number(token.replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : token;
};

export function numbersIn(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(normalise);
}

/** Every number the explanation is allowed to mention: only those present in the facts. */
export function allowedNumbers(facts: ExplainFacts): Set<string> {
  const source = [
    facts.entityId,
    String(facts.score ?? ""),
    facts.riskLevel,
    facts.status,
    facts.scale,
    ...facts.metrics.flatMap((m) => [m.label, m.value]),
    ...facts.drivers.flatMap((d) => [d.feature, String(Math.abs(d.impact)), d.description]),
  ].join(" ");
  const allowed = new Set(numbersIn(source));
  // "/100" is part of the documented score format.
  allowed.add("100");
  return allowed;
}

/** Returns the numbers in `text` that are not present in the facts (empty array = valid). */
export function unsupportedNumbers(text: string, facts: ExplainFacts): string[] {
  const allowed = allowedNumbers(facts);
  return [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
}
