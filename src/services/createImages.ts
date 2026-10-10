import { callClaudeJSON, callClaudeJSONWithImages, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';

// Pictures for LastMind Create's playtest: one cutout figure per character and a picture for visual evidence
// (CCTV, photographs, physical exhibits). A picture model on its own often draws a person from behind with their
// head turned, or puts the wrong thing in an exhibit, so each request produces several candidates and a quick
// vision check keeps one that actually fits, retrying once if none do.
const FAL_HEADERS = (key: string) => ({ Authorization: `Key ${key}`, 'Content-Type': 'application/json' });

// Words that make the model paint the BACK of a person (a slogan "on the back" of a jacket, "seen from behind"...).
export function cleanFigureDescription(text: string): string {
  return text
    .replace(/[^.,;]*\b(on|across) the back\b[^.,;]*/gi, '')
    .replace(/[^.,;]*\b(from behind|back of (his|her|their)|rear view)\b[^.,;]*/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,;.]+|[\s,;]+$/g, '')
    .trim();
}

export const FIGURE_STYLE =
  'Cinematic painterly digital art, front view waist-up portrait of one person standing squarely facing the camera, their whole torso turned toward the viewer so the FRONT of their clothing is visible (jacket front and buttons or zip, lapels, collar, tie or neckline), face and body facing the same direction, arms relaxed at their sides, warm low interior light, painterly texture, highly detailed, plain flat neutral mid-grey backdrop, centred in frame, no text, no lettering, no logos, not based on any real person.';

export const FOOTBALL_PORTRAIT_STYLE =
  'Photorealistic professional football club media-day photograph of exactly one fictional adult male footballer, front-facing head, shoulders and chest, both shoulders square to the camera, natural skin texture, realistic proportions, confident neutral expression, soft studio key light, dark navy seamless backdrop, centred composition, sharp eyes, shallow depth of field. He wears a solid plain red football shirt with a simple round collar, made of smooth matte fabric, the whole chest and both sleeves one even red with nothing printed or sewn on them. The person must not resemble a real footballer or celebrity.';

const EVIDENCE_STYLE: Record<string, string> = {
  cctv: 'A grainy low-resolution monochrome CCTV security camera still frame taken from a high corner, wide angle, slightly fisheye, flat harsh lighting. Any people are small and seen from a distance or from behind so no face can be identified. No text, no numbers, no timestamps.',
  photo: 'A realistic documentary crime-scene style photograph, flat on-camera flash lighting, ordinary and unglamorous. Any people are seen from behind or far away so no face can be identified. No text, no numbers.',
  physical: 'A realistic forensic photograph of a single exhibit lying on a plain table under harsh light, inside a clear sealed plastic evidence bag, sharp focus, ordinary and unglamorous. No people. No text, no labels, no numbers.',
};

async function falImages(key: string, prompt: string, size: { width: number; height: number }, n: number): Promise<string[]> {
  const r = await fetch('https://fal.run/fal-ai/flux/schnell', { method: 'POST', headers: FAL_HEADERS(key), body: JSON.stringify({ prompt, image_size: size, num_images: n }) });
  if (!r.ok) throw new Error(`image service ${r.status}`);
  const j: any = await r.json();
  return (j?.images || []).map((i: any) => i?.url).filter(Boolean);
}
async function toBase64(url: string): Promise<{ base64: string; mime: 'image/jpeg' | 'image/png' }> {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  return { base64: buf.toString('base64'), mime: (r.headers.get('content-type') || '').includes('png') ? 'image/png' : 'image/jpeg' };
}

const PORTRAIT_JUDGE_PROMPT = `You check AI-generated character pictures for a courtroom drama, one by one. For each numbered picture decide whether it is USABLE: (1) exactly one person; (2) their body and clothing face the camera the SAME way as their face - we must see the FRONT of their jacket, shirt, collar or neckline, NOT the back of a jacket or shoulders with the head turned round to face us; (3) head, shoulders and torso look natural (no extra, missing or fused limbs); (4) no readable lettering on the clothing. Output ONLY valid JSON: { "results": [ { "ok": true, "reason": "" } ] } with one entry per picture in order.`;
// Squad cards: the shirt has to be a plain red one with nothing on it (the club's own crest is added afterwards, the same on every card),
// so a picture with any manufacturer tick, sponsor, lettering, stripe or other mark is refused. Also asked: where the crest should sit.
const FOOTBALL_JUDGE_PROMPT = `You check AI-generated squad-card photographs of fictional footballers, one by one. For each numbered picture decide whether it is USABLE. It is usable only if ALL of these hold: (1) exactly one person; (2) the person faces the camera, with chest and shoulders square to it, so the front of the shirt is plainly visible; (3) the shirt is a solid red colour (a red between crimson and scarlet; not pink, not maroon, not orange, not white or any other colour); (4) there is NOTHING on the shirt: no manufacturer logo or tick or swoosh, no club crest or badge, no sponsor, no lettering, no numbers, no stripes, no bands, no printed pattern. A tiny mark counts. Plain collar or cuff trim of the same red is fine; (5) head, shoulders and torso look natural, with no extra or fused limbs and no distorted face. Also, for each USABLE picture give "badge": the centre of the spot on the shirt where a small club crest would normally sit, on the wearer's LEFT chest (that is on the RIGHT-hand side of the picture as we look at it), as fractions of the picture: "x" from the left edge (0 to 1), "y" from the top edge (0 to 1), and "s" the crest's width as a fraction of the picture width (usually 0.08 to 0.12, in proportion to the chest). The spot must lie on the red shirt, about a hand's width below the collar bone line and in from the shoulder seam. Output ONLY valid JSON: { "results": [ { "ok": true, "reason": "", "badge": { "x": 0.64, "y": 0.86, "s": 0.1 } } ] } with one entry per picture in order.`;
const EVIDENCE_JUDGE_PROMPT = `You check AI-generated pictures of case evidence, one by one. You are told what the picture is meant to show. For each numbered picture give "match" 0-10 (how well it shows what was described: the right kind of object or scene, the right details) and set "bad" true if it contains readable text or numbers, or a clearly visible human face. Output ONLY valid JSON: { "results": [ { "match": 0, "bad": false, "reason": "" } ] } with one entry per picture in order.`;

async function judge(system: string, userText: string, urls: string[], userId?: string): Promise<any[]> {
  const images = [];
  for (let i = 0; i < urls.length; i++) {
    const b = await toBase64(urls[i]);
    images.push({ mediaType: b.mime, base64Data: b.base64, label: `Picture ${i + 1}:` });
  }
  const raw = await callClaudeJSONWithImages({ model: MODELS.simpleQuestion, systemPrompt: system, userText, images, maxTokens: 600, temperature: 0, userId, meteredReason: 'create-image-check' });
  const parsed = parseModelJson<any>(raw);
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

export interface FigureResult { url: string; transparent: boolean; rounds: number; usable: boolean; costUsd: number; badge?: { x: number; y: number; s: number } }

// One canonical waist-up figure with the background removed.
export async function generatePortraitCutout(key: string, description: string, userId?: string): Promise<FigureResult> {
  const clean = cleanFigureDescription(description) || 'an adult in ordinary clothes';
  let cost = 0; let chosen: string | null = null; let usable = false; let rounds = 0;
  let fallback: string | null = null;
  for (rounds = 1; rounds <= 2 && !chosen; rounds++) {
    const urls = await falImages(key, `${FIGURE_STYLE} ${clean}`, { width: 576, height: 768 }, 3);
    cost += 0.009;
    if (!urls.length) continue;
    fallback = fallback || urls[0];
    try {
      const results = await judge(PORTRAIT_JUDGE_PROMPT, `Each picture is meant to show: ${clean}. Judge all ${urls.length}.`, urls, userId);
      cost += 0.004;
      const i = results.findIndex((r) => r && r.ok === true);
      if (i >= 0) { chosen = urls[i]; usable = true; }
    } catch (err) {
      console.error('Portrait check failed (keeping the first candidate):', err);
      chosen = urls[0];
      break;
    }
  }
  const src = chosen || fallback;
  if (!src) throw new Error('no image returned');
  // Background removal; if it is unavailable the plain picture is used as a card.
  try {
    const cut = await fetch('https://fal.run/fal-ai/imageutils/rembg', { method: 'POST', headers: FAL_HEADERS(key), body: JSON.stringify({ image_url: src }) });
    cost += 0.002;
    if (cut.ok) { const j: any = await cut.json(); if (j?.image?.url) return { url: j.image.url, transparent: true, rounds: rounds - 1, usable, costUsd: cost }; }
  } catch (err) { console.error('Background removal failed:', err); }
  return { url: src, transparent: false, rounds: rounds - 1, usable, costUsd: cost };
}

// A coordinated photographic squad-card portrait. The studio background is retained so hair and shirt edges stay natural.
export async function generateFootballPortrait(key: string, description: string, userId?: string): Promise<FigureResult> {
  const clean = cleanFigureDescription(description) || 'an adult male professional footballer';
  let chosen = ''; let usable = false; let cost = 0; let badge: FigureResult['badge'];
  const unit = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  // Up to two rounds of four candidates: the first one that passes the strict check is used. If none does, the best guess is returned
  // marked not usable, so the page can say so rather than showing a picture with a manufacturer's mark on it as if it were fine.
  for (let round = 1; round <= 2 && !usable; round++) {
    const urls = await falImages(key, `${FOOTBALL_PORTRAIT_STYLE} Player details: ${clean}`, { width: 768, height: 896 }, 4);
    cost += 0.012;
    if (!urls.length) continue;
    if (!chosen) chosen = urls[0];
    try {
      const results = await judge(FOOTBALL_JUDGE_PROMPT, `Each picture is meant to show this fictional male footballer: ${clean}. Judge all ${urls.length}.`, urls, userId);
      cost += 0.005;
      const i = results.findIndex((r) => r && r.ok === true);
      if (i >= 0) {
        chosen = urls[i]; usable = true;
        const b = results[i].badge || {};
        // The crest goes on the wearer's left chest (right of the picture) and always inside the lower middle of the picture.
        badge = { x: unit(b.x, 0.56, 0.74, 0.64), y: unit(b.y, 0.74, 0.93, 0.85), s: unit(b.s, 0.07, 0.13, 0.1) };
      }
    } catch (err) {
      console.error('Football portrait check failed:', err);
      break;
    }
  }
  if (!chosen) throw new Error('no image returned');
  return { url: chosen, transparent: false, rounds: 1, usable, costUsd: cost, badge };
}

// The picture service refuses violent wording, and a classroom picture should not show injury anyway. Cortex (Haiku) restates
// the evidence as a neutral image prompt that keeps the objects, layout, lighting and viewpoint: the object alone, or the moment
// before or after, with stains as dark residue and any people small, distant or from behind.
const NEUTRAL_PROMPT_SYSTEM = `You turn a description of a piece of case evidence into a short, neutral image-generation prompt for a picture that could appear in a classroom. Keep the objects, layout, setting, lighting and camera viewpoint faithful to the description, but remove anything violent, injurious or gory: no blood, wounds, stabbing, fighting, weapons being used or bodies. Show the scene just before or after the incident, or the object alone, and describe any stain as dark residue. People, if any, are small, distant or seen from behind, and never named. One or two plain sentences. Output ONLY valid JSON: { "prompt": "" }`;
export async function neutralImagePrompt(kind: string, description: string, userId?: string): Promise<string> {
  try {
    const raw = await callClaudeJSON({ model: MODELS.simpleQuestion, systemPrompt: NEUTRAL_PROMPT_SYSTEM, userContent: JSON.stringify({ kind, description }), maxTokens: 250, temperature: 0, userId, meteredReason: 'create-image-prompt' });
    const p = parseModelJson<any>(raw)?.prompt;
    if (typeof p === 'string' && p.trim()) return p.trim().slice(0, 500);
  } catch (err) { console.error('Neutral image prompt failed (using a plain fallback):', err); }
  return description.replace(/(blood|bloody|stab\w*|wound\w*|kill\w*|murder\w*|fight\w*|body|bodies)/gi, 'marks').slice(0, 400);
}

// A picture for a piece of visual evidence, faithful to what the exhibit is described as showing.
export async function generateEvidencePicture(key: string, kind: string, description: string, userId?: string): Promise<{ url: string; matched: boolean; costUsd: number }> {
  const style = EVIDENCE_STYLE[kind] || EVIDENCE_STYLE.photo;
  const safe = await neutralImagePrompt(kind, description, userId);
  const prompt = `${style} It shows: ${safe}`;
  description = safe;
  let cost = 0.001; const scored: { url: string; score: number }[] = [];
  const top = () => scored.reduce<{ url: string; score: number } | null>((a, b) => (!a || b.score > a.score ? b : a), null);
  for (let round = 1; round <= 2; round++) {
    let urls: string[] = [];
    try { urls = await falImages(key, round === 1 ? prompt : `${style} An empty, ordinary view of the same place or object, no people.`, { width: 768, height: 576 }, 3); }
    catch (err) { console.error('Evidence picture request refused:', err); continue; }
    cost += 0.009;
    if (!urls.length) continue;
    try {
      const results = await judge(EVIDENCE_JUDGE_PROMPT, `The picture is meant to show: ${description}. Judge all ${urls.length}.`, urls, userId);
      cost += 0.004;
      results.forEach((r, i) => { if (urls[i]) scored.push({ url: urls[i], score: (Number(r?.match) || 0) - (r?.bad ? 6 : 0) }); });
    } catch (err) {
      console.error('Evidence picture check failed (keeping the first candidate):', err);
      if (!scored.length) scored.push({ url: urls[0], score: 0 });
      break;
    }
    const best = top();
    if (best && best.score >= 7) break;
  }
  const best = top();
  if (!best) throw new Error('no image returned');
  return { url: best.url, matched: best.score >= 6, costUsd: cost };
}

export async function downloadAsDataUrl(url: string, transparent: boolean): Promise<string> {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = transparent ? 'image/png' : (r.headers.get('content-type') || 'image/jpeg');
  return `data:${mime};base64,${buf.toString('base64')}`;
}
