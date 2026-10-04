"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExplainFacts, ExplainResponse } from "@/lib/explain/types";
import { templateExplanation } from "@/lib/explain/template";

interface ExplanationPanelProps {
  facts: ExplainFacts;
}

const cache = new Map<string, ExplainResponse>();

const REASON_LABEL: Record<string, string> = {
  LLM_NOT_CONFIGURED: "AI key not configured",
  NO_VALID_SCORE: "no valid score",
  LLM_UNSUPPORTED_NUMBERS: "AI text rejected: unverified numbers",
  LLM_TIMEOUT: "AI timed out",
};

/** Plain-English explanation of an existing score. The numbers stay visible next to the text. */
export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({ facts }) => {
  const key = useMemo(() => JSON.stringify(facts), [facts]);
  const template = useMemo(() => templateExplanation(facts), [facts]);
  // Latest network outcome, tagged with the facts it belongs to so stale answers are ignored.
  const [fetched, setFetched] = useState<{ key: string; response: ExplainResponse } | null>(null);

  const cached = cache.get(key);
  const fromFetch = fetched?.key === key ? fetched.response : undefined;
  // Show the verified template immediately; upgrade to the AI wording once it validates.
  const result: ExplainResponse = cached ?? fromFetch ?? { text: template, source: "template" };
  const loading = facts.score !== null && !cached && !fromFetch;

  useEffect(() => {
    if (facts.score === null || cache.has(key)) return;
    const controller = new AbortController();
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
      signal: controller.signal,
    })
      .then((r) =>
        r.ok ? (r.json() as Promise<ExplainResponse>) : Promise.reject(new Error(String(r.status)))
      )
      .then((response) => {
        cache.set(key, response);
        setFetched({ key, response });
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setFetched({
          key,
          response: { text: template, source: "template", reason: "EXPLAIN_REQUEST_FAILED" },
        });
      });
    return () => controller.abort();
  }, [key, template, facts.score]);
  const headline =
    facts.score === null ? "Score unavailable" : `${facts.kind === "FRAUD" ? "Fraud risk" : "Loan distress"} ${facts.score}/100`;

  return (
    <div className="border-2 border-[#141413] p-4 bg-[#FFFFFF]" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#141413]/20">
        <span className="text-xs font-bold uppercase text-[#141413] tracking-wider">
          PLAIN-ENGLISH EXPLANATION
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-[#FAF7F2] text-[#141413] border border-[#141413] font-bold px-2 py-0.5 uppercase">
            {facts.scoreSource === "HEURISTIC" ? "RULE-BASED SCORE" : "ML MODEL SCORE"}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 uppercase text-white ${
              result.source === "llm" ? "bg-[#2A4B45]" : "bg-[#141413]"
            }`}
            title={result.reason ? REASON_LABEL[result.reason] ?? result.reason : undefined}
          >
            {loading ? "CHECKING…" : result.source === "llm" ? "AI · NUMBERS VERIFIED" : "FROM MODEL VALUES"}
          </span>
        </div>
      </div>

      <p className="text-xs md:text-sm mt-2.5 leading-relaxed text-[#141413] font-medium">
        {result.text}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="text-[10px] font-bold font-mono bg-[#141413] text-white px-2 py-0.5">
          {headline}
        </span>
        {facts.metrics.map((m) => (
          <span
            key={m.label}
            className="text-[10px] font-semibold bg-[#FAF7F2] border border-[#141413] px-2 py-0.5 text-[#141413]"
          >
            {m.label}: <span className="font-bold font-mono">{m.value}</span>
          </span>
        ))}
      </div>
      {result.reason && result.source === "template" && REASON_LABEL[result.reason] && (
        <p className="mt-2 text-[10px] text-[#141413]/60 font-semibold uppercase">
          Using built-in wording: {REASON_LABEL[result.reason]}
        </p>
      )}
    </div>
  );
};
