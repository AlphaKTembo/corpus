import * as fs from 'fs';
import * as path from 'path';

/**
 * Appends one JSON line per AI call to <corpusRoot>/metadata/ai_usage.jsonl.
 * Only model, token counts, timing and error status are recorded, never
 * prompt or response content. Used for cost tracking and by the server's
 * monitoring script (infra/monitor.sh).
 */
export function recordAiUsage(corpusRoot: string, entry: Record<string, unknown>): void {
  try {
    const dir = path.join(corpusRoot, 'metadata');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'ai_usage.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), provider: 'anthropic', ...entry }) + '\n',
    );
  } catch {
    // Usage logging must never break a user request.
  }
}

/** Usage fields from an Anthropic Messages API response. */
export function anthropicUsage(data: any): Record<string, unknown> {
  return {
    input_tokens: data?.usage?.input_tokens ?? null,
    output_tokens: data?.usage?.output_tokens ?? null,
    cache_read_input_tokens: data?.usage?.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: data?.usage?.cache_creation_input_tokens ?? null,
  };
}

/** Classifies an error thrown by an Anthropic call for logging. */
export function anthropicErrorFields(err: unknown): Record<string, unknown> {
  const message = (err as Error)?.message || String(err);
  const status = /Anthropic request failed: (\d{3})/.exec(message)?.[1] ?? null;
  return {
    status,
    error: /not configured/.test(message) ? 'api_key_missing' : status ? `http_${status}` : 'error',
  };
}
