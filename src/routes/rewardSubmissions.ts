import { Router, Request, Response } from 'express';
import { publicFormLimiter } from '../services/rateLimiters';
import { supabaseAdmin } from '../services/supabaseAdmin';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_CATEGORIES = ['Local Offers', 'National'];

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

// Verifies the Turnstile token the widget attaches to the form (see
// partner-signup/index.html) against Cloudflare's own API — the one thing
// that actually stops scripted spam on a form with no login at all.
// TURNSTILE_SECRET_KEY is the private half of the pair; the public site
// key lives directly in the frontend HTML, same as Supabase's anon key.
async function verifyTurnstileToken(token: string, remoteIp: string | undefined): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.warn('LastMind: TURNSTILE_SECRET_KEY is not set — skipping Turnstile verification.');
    return true;
  }
  try {
    const params = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) params.set('remoteip', remoteIp);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const result = (await resp.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.error('Turnstile verification request failed:', err);
    return false;
  }
}

// POST /reward-submissions — public, no auth (businesses aren't LastMind
// accounts). Purely a mailbox: rows land in reward_submissions for manual
// review (that table's own Supabase editor is enough, same as `rewards`
// itself), then get hand-added to KEY_MARKET_REWARDS in learn/index.html
// once approved — nothing here touches the live Key Market automatically.
router.post('/reward-submissions', publicFormLimiter, async (req: Request, res: Response) => {
  const body = req.body ?? {};

  const turnstileToken = cleanString(body.turnstileToken, 2000);
  if (!turnstileToken) {
    return res.status(400).json({ error: 'Please complete the verification check.' });
  }
  const turnstileOk = await verifyTurnstileToken(turnstileToken, req.ip);
  if (!turnstileOk) {
    return res.status(400).json({ error: 'Verification check failed — please try again.' });
  }

  const businessName = cleanString(body.businessName, 100);
  const contactEmail = cleanString(body.contactEmail, 200);
  const contactPhone = body.contactPhone ? cleanString(body.contactPhone, 20) : null;
  const title = cleanString(body.title, 100);
  const terms = body.terms ? cleanString(body.terms, 300) : null;
  const category = body.category ? cleanString(body.category, 50) : null;
  const accentColor = body.accentColor ? cleanString(body.accentColor, 7) : null;
  const backgroundColor = body.backgroundColor ? cleanString(body.backgroundColor, 7) : null;
  const textColor = body.textColor ? cleanString(body.textColor, 7) : null;
  const catchmentArea = body.catchmentArea ? cleanString(body.catchmentArea, 150) : null;

  if (!businessName || !contactEmail || !title) {
    return res.status(400).json({ error: 'businessName, contactEmail, and title are required.' });
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return res.status(400).json({ error: 'contactEmail is not a valid email address.' });
  }
  if (contactPhone && !PHONE_RE.test(contactPhone)) {
    return res.status(400).json({ error: 'contactPhone does not look like a valid phone number.' });
  }
  if (accentColor && !HEX_COLOR_RE.test(accentColor)) {
    return res.status(400).json({ error: 'accentColor must be a hex color like #E6D7B0.' });
  }
  if (backgroundColor && !HEX_COLOR_RE.test(backgroundColor)) {
    return res.status(400).json({ error: 'backgroundColor must be a hex color like #201F21.' });
  }
  if (textColor && !HEX_COLOR_RE.test(textColor)) {
    return res.status(400).json({ error: 'textColor must be a hex color like #F8F5EF.' });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}.` });
  }
  if (category === 'Local Offers' && !catchmentArea) {
    return res.status(400).json({ error: 'catchmentArea is required for Local Offers.' });
  }

  let suggestedCostKeys: number | null = null;
  if (body.suggestedCostKeys !== undefined && body.suggestedCostKeys !== null && body.suggestedCostKeys !== '') {
    const n = Number(body.suggestedCostKeys);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return res.status(400).json({ error: 'suggestedCostKeys must be a reasonable positive number.' });
    }
    suggestedCostKeys = Math.round(n);
  }

  try {
    const { error } = await supabaseAdmin.from('reward_submissions').insert({
      business_name: businessName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      title,
      // reward_submissions.description is still NOT NULL in the DB; the form
      // no longer collects one, so we satisfy the constraint with ''.
      description: '',
      terms,
      category,
      suggested_cost_keys: suggestedCostKeys,
      accent_color: accentColor,
      background_color: backgroundColor,
      text_color: textColor,
      catchment_area: category === 'Local Offers' ? catchmentArea : null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Reward submission failed:', err);
    res.status(500).json({ error: 'Could not submit — please try again in a moment.' });
  }
});

export default router;
