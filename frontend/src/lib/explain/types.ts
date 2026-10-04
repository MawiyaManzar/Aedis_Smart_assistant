/**
 * Facts handed to the explanation layer. Every value here must come straight from the
 * model/heuristic result already shown in the UI; the layer never computes new risk numbers.
 */
export type ExplainKind = "FRAUD" | "LOAN";
export type ScoreSource = "MODEL" | "HEURISTIC";

export interface ExplainDriver {
  feature: string;
  impact: number; // signed contribution already shown in the UI (+ raises risk, - lowers it)
  description: string;
}

export interface ExplainMetric {
  label: string;
  value: string; // display string, e.g. "$45,000" or "12.5x"
}

export interface ExplainFacts {
  kind: ExplainKind;
  entityId: string;
  scoreSource: ScoreSource;
  /** 0-100 score, or null when the model/heuristic did not return a valid number. */
  score: number | null;
  riskLevel: string;
  status: string;
  /** Fixed, documented thresholds the UI already uses (so "what the score means" is factual). */
  scale: string;
  metrics: ExplainMetric[];
  drivers: ExplainDriver[];
}

export type ExplainSource = "llm" | "template";

export interface ExplainResponse {
  text: string;
  source: ExplainSource;
  /** Why the template was used instead of the LLM (omitted when the LLM text was used). */
  reason?: string;
}
