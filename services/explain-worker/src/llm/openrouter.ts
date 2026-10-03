import { config } from '../config.js';
import { ShapDriver } from '../types.js';

export interface LlmExplanationResponse {
  summary: string;
  model: string;
  usedFallback: boolean;
}

/**
 * Builds deterministic compliance fallback sentence following ADR-004 format
 * when OpenRouter API key is not present or API is offline.
 */
export function buildDeterministicSummary(
  fraudScore: number,
  drivers: ShapDriver[],
  status: string
): string {
  const scorePercent = Math.round(fraudScore * 100);
  const primary = drivers[0]?.label || 'Unusual behavioral anomaly detected';
  const secondary = drivers[1]?.label ? ` accompanied by ${drivers[1].label.toLowerCase()}` : '';

  const prefix = status === 'BLOCKED' ? 'Transaction blocked' : 'Transaction flagged for review';
  const sentence = `${prefix} (Risk ${scorePercent}/100): ${primary}${secondary}.`;

  // Enforce ≤ 200 characters compliance restriction
  return sentence.length > 200 ? sentence.slice(0, 197) + '...' : sentence;
}

/**
 * Derives a 1-sentence regulator-ready audit summary via OpenRouter API
 * with temperature=0 and seed=42 per ADR-004.
 */
export async function generateRegulatorSummary(
  fraudScore: number,
  status: string,
  drivers: ShapDriver[]
): Promise<LlmExplanationResponse> {
  if (!config.openrouterApiKey) {
    return {
      summary: buildDeterministicSummary(fraudScore, drivers, status),
      model: 'deterministic-compliance-template',
      usedFallback: true,
    };
  }

  const promptDrivers = drivers
    .map((d) => `- ${d.label} (${d.direction} magnitude: ${d.magnitude})`)
    .join('\n');

  const userContent = `Risk score: ${Math.round(fraudScore * 100)}/100.\nStatus: ${status}.\nTop contributing factors:\n${promptDrivers}\nProduce one regulator-ready audit sentence.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout for LLM

    const response = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openrouterApiKey}`,
        'HTTP-Referer': 'https://aedis.bank',
        'X-Title': 'Aedis Smart Assistant',
      },
      body: JSON.stringify({
        model: config.openrouterModel,
        temperature: config.temperature,
        seed: config.seed,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content:
              'You are a financial risk compliance assistant. Output exactly ONE sentence under 200 characters. No markdown. No numbers beyond 2 d.p. Use bank transaction terminology only.',
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      let text = data.choices?.[0]?.message?.content?.trim() || '';

      // Strip quotes and newlines
      text = text.replace(/^["']|["']$/g, '').replace(/\r?\n|\r/g, ' ');

      if (text.length > 0) {
        if (text.length > 200) {
          text = text.slice(0, 197) + '...';
        }
        return {
          summary: text,
          model: config.openrouterModel,
          usedFallback: false,
        };
      }
    }
  } catch (_err) {
    // Graceful fallback to deterministic template on any network or API error
  }

  return {
    summary: buildDeterministicSummary(fraudScore, drivers, status),
    model: `${config.openrouterModel}-fallback`,
    usedFallback: true,
  };
}
