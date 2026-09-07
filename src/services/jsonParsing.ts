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

// Repairs the single most common way a model breaks its own "output ONLY
// JSON" instruction despite the brace-extraction fallback above already
// handling stray prose: quoting a term/phrase INSIDE a string value with
// literal " characters instead of escaping them - e.g. feedback text like
// `"...you rightly identified that "ceteris paribus" means..."`, found
// live (a real, reproducible grading failure specific to any concept name
// a model naturally wants to quote back to the student). extractJsonObject
// can't fix this - the JSON is genuinely malformed mid-string, not just
// wrapped in extra text.
//
// Walks character by character tracking whether we're inside a string; a
// `"` encountered there is treated as a real closing quote only if what
// follows (after whitespace) looks like a genuine JSON continuation (`,`,
// `}`, `]`, `:`, or end of string) - otherwise it's an internal quote that
// gets escaped and string mode continues. Already-valid JSON (including
// JSON with correctly escaped internal quotes) passes through unchanged,
// since every quote in it is already exactly where this heuristic expects
// a real one to be.
function repairUnescapedQuotes(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inString) {
      out += ch + (text[i + 1] || '');
      i++;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        out += ch;
        continue;
      }
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      const looksLikeRealClose = next === undefined || ',}]:'.includes(next);
      if (looksLikeRealClose) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

// Repairs a real, reproducible failure mode: the model writes a literal
// control character (a real newline between paragraphs is the most common
// case, but JSON forbids the ENTIRE U+0000-U+001F range unescaped inside a
// string, not just \n/\r/\t) instead of escaping it. First found live as a
// literal \n (most often when a prompt asks for multi-paragraph text, e.g.
// an "explanation" field, since a model naturally reaches for a real line
// break between paragraphs) - then found AGAIN, still failing, on a
// response that had already been through this exact repair, meaning the
// culprit that time was some OTHER control character outside the
// originally-handled \n/\r/\t set. Rather than keep adding one character
// at a time as each one turns up live, this now escapes the full control
// range generically: the five with a short JSON escape use it (\n \r \t \b
// \f), anything else uses \uXXXX. Walks character by character tracking
// string state (same escape-aware approach as repairUnescapedQuotes);
// already-escaped JSON passes through unchanged.
const JSON_SHORT_ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
export function escapeRawControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += JSON_SHORT_ESCAPES[ch] || `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

// Targeted, schema-aware parse for the `{ "correct": boolean, "feedback":
// string }` shape (KNOWLEDGE_MAP_ANSWER_CHECK_PROMPT, VERIFY_LEARNING_PROMPT
// and their callers in routes/knowledgeMap.ts and nodeReviewService.ts) —
// this is the shape that actually kept producing the recurring "ceteris
// paribus" submit failure even after repairUnescapedQuotes above: that
// heuristic treats a `"` followed by a comma as a real closing quote (a
// perfectly reasonable JSON continuation), but a model quoting a term back
// to the student very naturally continues straight into a comma
// afterwards — "...used "ceteris paribus", which shows..." — so the
// generic repair snaps the string shut right there and the rest of the
// sentence is left dangling outside it, still broken.
//
// "feedback" is always this schema's LAST field (fixed by the prompt's own
// output schema), so its real closing quote is unambiguously the LAST `"`
// in the object — no character-by-character guessing needed at all, and
// every internal `"` the model left unescaped is simply part of the value.
export function parseCorrectFeedbackJson(raw: string): { correct: boolean; feedback: string } {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as { correct: boolean; feedback: string };
  } catch {
    // fall through to targeted extraction below
  }
  const extracted = extractJsonObject(cleaned);
  const correctMatch = extracted.match(/"correct"\s*:\s*(true|false)/i);
  const feedbackKeyMatch = extracted.match(/"feedback"\s*:\s*"/);
  if (correctMatch && feedbackKeyMatch) {
    const valueStart = feedbackKeyMatch.index! + feedbackKeyMatch[0].length;
    const lastQuote = extracted.lastIndexOf('"');
    if (lastQuote > valueStart) {
      const feedbackRaw = extracted.slice(valueStart, lastQuote);
      const feedback = feedbackRaw.replace(
        /\\(["\\/bfnrt])/g,
        (_, c: string) => ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[c] as string
      );
      return { correct: correctMatch[1].toLowerCase() === 'true', feedback };
    }
  }
  return parseModelJson<{ correct: boolean; feedback: string }>(raw);
}

export function parseModelJson<T>(raw: string): T {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const extracted = extractJsonObject(cleaned);
    try {
      return JSON.parse(extracted) as T;
    } catch {
      try {
        return JSON.parse(repairUnescapedQuotes(extracted)) as T;
      } catch {
        try {
          // Raw control characters (most often a literal newline between
          // paragraphs) fail JSON.parse outright, before either repair
          // above gets a chance - tried last since it's the rarer case and
          // the two repairs are independent of each other.
          return JSON.parse(escapeRawControlCharsInStrings(extracted)) as T;
        } catch {
          try {
            return JSON.parse(escapeRawControlCharsInStrings(repairUnescapedQuotes(extracted))) as T;
          } catch (err) {
            console.error('LastMind: model call returned invalid JSON.', { raw });
            throw err;
          }
        }
      }
    }
  }
}
