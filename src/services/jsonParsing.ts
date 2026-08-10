// Shared, hardened JSON parsing for Claude responses that are supposed to
// be "output ONLY valid JSON" — used by every service that calls callJSON
// against a model. A bare JSON.parse throws on either genuine truncation
// (nothing to do about that) OR a stray bit of prose the model wrapped the
// JSON in despite instructions not to (the far more recoverable case) —
// this falls back to the outermost {...} span before giving up, so a
// single flaky response doesn't need to hard-fail an entire multi-turn
// diagnostic session (which previously surfaced to the student as a wrong
// answer being reported as "could not process" and the session ending
// early instead of continuing).

export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

export function parseModelJson<T>(raw: string): T {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(extractJsonObject(cleaned)) as T;
    } catch (err) {
      console.error('LastMind: model call returned invalid JSON.', { raw });
      throw err;
    }
  }
}
