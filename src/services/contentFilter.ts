import { NextFunction, Request, Response } from 'express';

// Two protections for anything a student types into LastMind Create, the Law playtest and the Chancellor simulation:
//  1. Vulgar or abusive language is refused before it reaches the AI (the request comes back as 422 CONTENT_BLOCKED).
//  2. Personal information (emails, phone numbers, card and ID numbers, and for free-text boxes also addresses, postcodes,
//     dates of birth and IP addresses) is redacted before it reaches the AI, and the response carries X-Content-Redacted.
// The same rules run in the page (learn/index.html, lmScreenText) so students are told before they send.

export type PiiKind = 'email' | 'phone' | 'card' | 'id-number' | 'iban' | 'address' | 'postcode' | 'date-of-birth' | 'ip-address';

const luhn = (digits: string): boolean => {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};

interface Rule { kind: PiiKind; re: RegExp; strictOnly?: boolean; check?: (m: string) => boolean }
const RULES: Rule[] = [
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  { kind: 'card', re: /\b\d(?:[ -]?\d){12,18}\b/g, check: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); } },
  { kind: 'id-number', re: /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g },
  { kind: 'id-number', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'phone', re: /(?<![\w.])(?:\+\d{1,3}[ -]?)?\(?0?7\d{3}\)?[ -]?\d{3}[ -]?\d{3}(?!\d)/g },
  { kind: 'phone', re: /(?<![\w.])\+\d{1,3}[ -]?\(?\d{1,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}(?!\d)/g },
  { kind: 'phone', re: /(?<![\w.])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g },
  { kind: 'phone', re: /(?<![\w.])0\d{2,4}[ -]\d{3,4}[ -]\d{3,4}(?!\d)/g },
  { kind: 'ip-address', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, strictOnly: true },
  { kind: 'postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, strictOnly: true },
  { kind: 'address', re: /\b\d{1,4}[A-Za-z]?\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Court|Way|Crescent|Terrace|Place|Gardens|Grove)\b/g, strictOnly: true },
  { kind: 'date-of-birth', re: /\b(?:born(?: on)?|dob|d\.o\.b\.?|date of birth)[:\s]+\d{1,2}[\/.\- ]\d{1,2}[\/.\- ]\d{2,4}\b/gi, strictOnly: true },
];

export function redactPii(text: string, strict: boolean): { text: string; found: PiiKind[] } {
  const found = new Set<PiiKind>();
  let out = text;
  for (const rule of RULES) {
    if (rule.strictOnly && !strict) continue;
    out = out.replace(rule.re, (m) => {
      if (rule.check && !rule.check(m)) return m;
      found.add(rule.kind);
      return `[${rule.kind} removed]`;
    });
  }
  return { text: out, found: [...found] };
}

// ---- vulgar language ----
// Patterns are built from letter classes so common spelling tricks (f*ck, sh1t, c u n t) are still caught, and anchored on
// word boundaries so ordinary words (Scunthorpe, classic, assess) are not.
const L: Record<string, string> = { a: '[a4@*]', b: '[b8]', c: '[c(]', e: '[e3*]', g: '[g9]', i: '[i1!|*]', l: '[l1|]', o: '[o0*]', s: '[s5$]', t: '[t7+]', u: '[uv*]' };
const loose = (w: string): string => w.split('').map((ch) => (L[ch] || ch) + '[\\W_]{0,2}').join('').replace(/\[\\W_\]\{0,2\}$/, '');
const BAD_WORDS = [
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'cunt', 'cunts', 'dick', 'dickhead', 'prick', 'twat', 'wanker', 'bollocks',
  'piss', 'pissed off', 'arsehole', 'asshole', 'slut', 'whore', 'cock', 'tosser', 'bellend', 'douchebag', 'jackass', 'dipshit', 'shithead', 'crap',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'spastic', 'paki', 'chink', 'kike', 'tranny', 'coon', 'gook', 'wetback', 'raghead',
];
const BAD_RE = BAD_WORDS.map((w) => new RegExp('(?<![A-Za-z])' + loose(w.replace(/ /g, '')) + '(?![A-Za-z])', 'i'));
export function hasVulgarLanguage(text: string): boolean {
  if (!text) return false;
  const flat = text.replace(/[​-‏⁠﻿]/g, '');
  return BAD_RE.some((re) => re.test(flat));
}

export const BLOCK_MESSAGE = 'Please keep it civil: that text contains offensive language, so it was not sent. Reword it and try again.';

// Which body fields are text the student typed (checked for vulgar language and fully redacted), by route.
const USER_TEXT_PATHS: Array<{ test: RegExp; keys: string[]; all?: boolean }> = [
  { test: /^\/create\/criminal-trial\/build$/, keys: ['idea', 'details'] },
  { test: /^\/playtest\/character-turn$/, keys: ['message'] },
  { test: /^\/playtest\/assess$/, keys: ['opening', 'closing', 'question'] },
  { test: /^\/chancellor\//, keys: [], all: true },
];

function walk(node: unknown, fn: (s: string, key: string, path: string[]) => string, key = '', path: string[] = [], depth = 0): unknown {
  if (depth > 8) return node;
  if (typeof node === 'string') return fn(node, key, path);
  if (Array.isArray(node)) return node.map((v) => walk(v, fn, key, path, depth + 1));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v, fn, k, [...path, k], depth + 1);
    return out;
  }
  return node;
}

export function screenRequestBody(req: Request, res: Response, next: NextFunction) {
  if (!req.body || typeof req.body !== 'object') return next();
  const fullPath = (req.originalUrl || req.url || '').split('?')[0];
  const rule = USER_TEXT_PATHS.find((r) => r.test.test(fullPath));
  const redacted = new Set<PiiKind>();
  let blocked = false;
  req.body = walk(req.body, (s, key, path) => {
    if (s.length > 20000 || s.startsWith('data:')) return s;   // images and other bulk data are not free text
    const isUser = !!rule && (rule.all || rule.keys.some((k) => key === k || path.includes(k)));
    if (isUser && hasVulgarLanguage(s)) blocked = true;
    const r = redactPii(s, isUser);
    r.found.forEach((f) => redacted.add(f));
    return r.text;
  });
  if (blocked) return res.status(422).json({ error: BLOCK_MESSAGE, code: 'CONTENT_BLOCKED' });
  if (redacted.size) res.setHeader('X-Content-Redacted', [...redacted].join(','));
  next();
}

// For text the server builds itself from user input (e.g. an interview answer inside a prompt).
export function cleanUserText(s: unknown, max: number): { text: string; blocked: boolean } {
  const raw = typeof s === 'string' ? s.trim().slice(0, max) : '';
  return { text: redactPii(raw, true).text, blocked: hasVulgarLanguage(raw) };
}
