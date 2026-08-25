import { Router, Request, Response } from 'express';
import { publicFormLimiter } from '../services/rateLimiters';
import { supabaseAdmin } from '../services/supabaseAdmin';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

// POST /reward-submissions — public, no auth (businesses aren't LastMind
// accounts). Purely a mailbox: rows land in reward_submissions for manual
// review (that table's own Supabase editor is enough, same as `rewards`
// itself), then get hand-added to KEY_MARKET_REWARDS in learn/index.html
// once approved — nothing here touches the live Key Market automatically.
router.post('/reward-submissions', publicFormLimiter, async (req: Request, res: Response) => {
  const body = req.body ?? {};

  const businessName = cleanString(body.businessName, 100);
  const contactEmail = cleanString(body.contactEmail, 200);
  const title = cleanString(body.title, 100);
  const description = cleanString(body.description, 500);
  const terms = body.terms ? cleanString(body.terms, 300) : null;
  const category = body.category ? cleanString(body.category, 50) : null;
  const accentColor = body.accentColor ? cleanString(body.accentColor, 7) : null;

  if (!businessName || !contactEmail || !title || !description) {
    return res.status(400).json({ error: 'businessName, contactEmail, title, and description are required.' });
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return res.status(400).json({ error: 'contactEmail is not a valid email address.' });
  }
  if (accentColor && !HEX_COLOR_RE.test(accentColor)) {
    return res.status(400).json({ error: 'accentColor must be a hex color like #E6D7B0.' });
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
      title,
      description,
      terms,
      category,
      suggested_cost_keys: suggestedCostKeys,
      accent_color: accentColor,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Reward submission failed:', err);
    res.status(500).json({ error: 'Could not submit — please try again in a moment.' });
  }
});

export default router;
