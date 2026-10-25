import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from './supabaseAdmin';

// Paid projects. The football manager costs £8.99 a month (and brings 30,000 Locks a month, see constants/locks.ts); the criminal-trial builder costs £4.99. Access is a row in `project_access`, written by the
// billing backend when a project subscription is paid, and read here with the service role: the browser's claim about what it has paid for is never
// trusted. A few accounts have every project without paying (the owner's own accounts).
export type Project = 'football' | 'law';

// FOOTBALL_FREE: when it is on, the football manager is free for everyone signed in. It is off by default now: the full season is paid (£8.99 a month, the Stripe price in
// STRIPE_FOOTBALL_PRICE_ID), while the demo, with the whole of the game's AI in it, stays open to every signed-in account on its 1,000 free Locks. Set the environment variable
// FOOTBALL_FREE=true to make the game free again. The Locks limits are separate. The law projects are never affected.
export const FOOTBALL_FREE = process.env.FOOTBALL_FREE ? !/^(false|0|no|off)$/i.test(process.env.FOOTBALL_FREE) : false;
export const PROJECTS: Project[] = ['football', 'law'];

const ALL_PROJECT_IDS = new Set(['1554f85d-95a0-49de-b48a-aa9c8363f7cd']);
const ALL_PROJECT_EMAILS = new Set(
  ['jamesmwood@btinternet.com', 'austinjwood095@gmail.com', 'ollyjs9@icloud.com']
    .concat((process.env.PROJECT_ACCESS_EMAILS || '').split(','))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const emailCache = new Map<string, string>();
async function emailOf(userId: string, known?: string | null): Promise<string> {
  if (known) return known.toLowerCase();
  const cached = emailCache.get(userId);
  if (cached !== undefined) return cached;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const e = (data?.user?.email || '').toLowerCase();
    emailCache.set(userId, e);
    return e;
  } catch {
    return '';
  }
}

// An address on the owner list only counts once Supabase has confirmed it, so nobody can sign up with an owner's address before the owner does and be given every project.
const confirmedCache = new Map<string, { ok: boolean; at: number }>();
async function emailIsConfirmed(userId: string): Promise<boolean> {
  const hit = confirmedCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ok;
  let ok = false;
  try { const { data } = await supabaseAdmin.auth.admin.getUserById(userId); ok = !!data?.user?.email_confirmed_at; } catch { ok = false; }
  confirmedCache.set(userId, { ok, at: Date.now() });
  return ok;
}

// Whether the account has an active football subscription (the row the billing backend writes), nothing else: used to size the monthly Locks. Remembered for a minute.
const footballSubCache = new Map<string, { ok: boolean; at: number }>();
export async function hasFootballSubscription(userId: string): Promise<boolean> {
  const hit = footballSubCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  let ok = false;
  try {
    const { data } = await supabaseAdmin.from('project_access').select('status,current_period_end').eq('user_id', userId).eq('project', 'football').maybeSingle();
    ok = !!data && ['active', 'trialing'].includes(String(data.status)) && (!data.current_period_end || Date.parse(data.current_period_end) > Date.now());
  } catch { ok = false; }
  footballSubCache.set(userId, { ok, at: Date.now() });
  return ok;
}

// Whether the person really has the project (paid for it, or is one of the owner's accounts), whatever the free offer says.
export async function hasPaidProjectAccess(userId: string, project: Project, email?: string | null): Promise<boolean> {
  if (ALL_PROJECT_IDS.has(userId)) return true;
  const e = await emailOf(userId, email);
  if (e && ALL_PROJECT_EMAILS.has(e) && (await emailIsConfirmed(userId))) return true;
  const { data, error } = await supabaseAdmin.from('project_access').select('status,current_period_end')
    .eq('user_id', userId).eq('project', project).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  if (!['active', 'trialing'].includes(String(data.status))) return false;
  return !data.current_period_end || Date.parse(data.current_period_end) > Date.now();
}

// Whether the person may use the project right now: the paid check, or anyone signed in while the football offer is on.
export async function hasProjectAccess(userId: string, project: Project, email?: string | null): Promise<boolean> {
  if (FOOTBALL_FREE && project === 'football') return true;
  return hasPaidProjectAccess(userId, project, email);
}

// Must run after requireAuth (it needs req.userId).
export function requireProject(project: Project) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Please sign in.' });
      if (!(await hasProjectAccess(req.userId, project, req.userEmail))) {
        return res.status(402).json({ error: 'This project needs a subscription.', code: 'PROJECT_SUBSCRIPTION_REQUIRED', project });
      }
      next();
    } catch (err) {
      console.error('Project access check failed:', err);
      res.status(500).json({ error: 'could not check your subscription' });
    }
  };
}
