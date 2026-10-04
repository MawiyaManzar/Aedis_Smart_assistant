import { NextResponse } from "next/server";
import { templateExplanation } from "@/lib/explain/template";
import { unsupportedNumbers } from "@/lib/explain/validate";
import { ExplainFacts, ExplainResponse } from "@/lib/explain/types";

export const runtime = "nodejs";

const OPENROUTER_URL =
  process.env.OPENROUTER_API_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const TIMEOUT_MS = 8000;
const MAX_TEXT_CHARS = 900;

const SYSTEM_PROMPT = [
  "You explain risk scores to bank staff in plain, simple English.",
  "Use ONLY the facts in the JSON the user sends. Never use outside knowledge.",
  "Copy every number exactly as written in the facts. Do not calculate, round, convert, or add any number that is not in the facts.",
  "Give reasons only from the listed drivers. Do not invent causes, people, places, or events.",
  "Say what the score means on its scale, then the main factors that raised or lowered it, then one or two key figures.",
  'If scoreSource is "HEURISTIC", say the score came from a rule-based calculation instead of the ML model.',
  "Write 2 to 4 sentences, under 90 words, no lists, no markdown, no advice or recommendations.",
].join(" ");

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Accepts only the expected shape and caps sizes, so the endpoint cannot be used as a free prompt. */
function parseFacts(body: unknown): ExplainFacts | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.kind !== "FRAUD" && b.kind !== "LOAN") return null;
  const score =
    typeof b.score === "number" && Number.isFinite(b.score) && b.score >= 0 && b.score <= 100
      ? b.score
      : null;
  const metrics = Array.isArray(b.metrics) ? b.metrics.slice(0, 15) : [];
  const drivers = Array.isArray(b.drivers) ? b.drivers.slice(0, 10) : [];
  return {
    kind: b.kind,
    entityId: str(b.entityId, 60),
    scoreSource: b.scoreSource === "HEURISTIC" ? "HEURISTIC" : "MODEL",
    score,
    riskLevel: str(b.riskLevel, 30),
    status: str(b.status, 40),
    scale: str(b.scale, 300),
    metrics: metrics.map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return { label: str(o.label, 80), value: str(o.value, 60) };
    }),
    drivers: drivers.map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        feature: str(o.feature, 60),
        impact: typeof o.impact === "number" && Number.isFinite(o.impact) ? o.impact : 0,
        description: str(o.description, 160),
      };
    }),
  };
}

function fallback(facts: ExplainFacts, reason: string): NextResponse<ExplainResponse> {
  return NextResponse.json({ text: templateExplanation(facts), source: "template", reason });
}

export async function POST(request: Request): Promise<NextResponse<ExplainResponse | { error: string }>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const facts = parseFacts(raw);
  if (!facts) return NextResponse.json({ error: "Invalid explanation facts" }, { status: 400 });

  // No valid score: nothing to explain, and nothing to send to an LLM.
  if (facts.score === null) return fallback(facts, "NO_VALID_SCORE");

  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY)?.trim();
  if (!apiKey) return fallback(facts, "LLM_NOT_CONFIGURED");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Aedis Smart Assistant",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 260,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Facts:\n${JSON.stringify(facts)}` },
        ],
      }),
    });
    if (!response.ok) return fallback(facts, `LLM_HTTP_${response.status}`);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) return fallback(facts, "LLM_EMPTY_RESPONSE");
    if (text.length > MAX_TEXT_CHARS) return fallback(facts, "LLM_TOO_LONG");

    // Guardrail: any number the LLM mentions must exist in the facts, otherwise discard it.
    const extra = unsupportedNumbers(text, facts);
    if (extra.length > 0) return fallback(facts, "LLM_UNSUPPORTED_NUMBERS");

    return NextResponse.json({ text, source: "llm" });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return fallback(facts, aborted ? "LLM_TIMEOUT" : "LLM_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
}
