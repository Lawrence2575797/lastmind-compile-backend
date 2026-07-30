# LastMind — Compile backend

Receives a student's notes from the frontend's Compile button, cleans them
through two PII filters and a harmful-content filter, then sends only the
cleaned text to Claude.

## ⚠️ Before anything else: rotate your API key

A Claude API key was pasted in plaintext in the conversation that produced
this code. **Treat that key as already compromised** — revoke it at
https://console.anthropic.com/settings/keys and generate a new one. Nothing
in this codebase contains that key or any other real secret; it only ever
reads from `process.env.CLAUDE_API_KEY`, which you set locally in a `.env`
file that's git-ignored by default.

## Setup

```bash
npm install
cp .env.example .env    # then fill in your NEW key, not the old one
npm run dev
```

`POST http://localhost:4100/compile` with `{ "notes": "..." }` to test it.

## Request flow

1. `routes/compile.ts` validates `notes` is a non-empty string.
2. `safety/piiFilterStructured.ts` — regex removal of emails, phone numbers,
   postcodes, addresses, handles, card-like numbers.
3. `safety/piiFilterContextual.ts` — phrase-based removal of things like
   "my name is X", "I go to X", "my teacher X".
4. `safety/harmfulContentFilter.ts` — keyword-based redaction of obviously
   harmful content. **This is a weak, easily-bypassed layer by design** —
   see the comment at the top of that file. It exists to reduce obvious
   exposure before a request leaves your server; it is not, and isn't
   meant to be, the actual safety mechanism. Claude's own safety training
   applies to every request regardless, and that's the real backstop.
5. `services/claudeClient.ts` sends only the fully-filtered `safeText` to
   Claude and returns its response.

The route always returns `{ result, safeText }` — `safeText` is included
so you (or a reviewer) can see exactly what left your server, which is
useful for debugging and for backing up the "personal information is
removed where possible" claim in your privacy policy honestly.

## Known limitations, stated plainly

- The PII regexes are heuristics. They will occasionally miss unusual
  phrasing or over-match ordinary text (e.g. a house number in a maths
  problem could get flagged as part of an address). That's an accepted
  tradeoff of a fast, dependency-free filter — not a claim of perfect PII
  removal.
- The harmful-content keyword list is intentionally small and generic. Do
  not expand it into an exhaustive list of harmful terms/phrases as a
  substitute for a real moderation approach — a short list plus Claude's
  own safety layer is the intended design here, not a big keyword
  database.
- None of this replaces an actual legal review of your privacy policy and
  data-handling claims if this goes into real use with real students.
