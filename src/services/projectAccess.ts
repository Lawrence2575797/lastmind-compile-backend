import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from './supabaseAdmin';

// Paid projects. The football manager and the criminal-trial builder each cost £4.99 a month. Access is a row in `project_access`, written by the
// billing backend when a project subscription is paid, and read here with the service role: the browser's claim about what it has paid for is never
// trusted. A few accounts have every project without paying (the owner's own accounts).
export type Project = 'football' | 'law';
export const PROJECTS: Project[] = ['football', 'law'];

const ALL_PROJECT_IDS = new Set(['1554f85d-95a0-49de-b48a-aa9c8363f7cd']);
const ALL_PROJECT_EMAILS = new Set(
  ['jamesmwood@btinternet.com', 'austinjwood095@gmail.com']
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

export async function hasProjectAccess(userId: string, project: Project, email?: string | null): Promise<boolean> {
  if (ALL_PROJECT_IDS.has(userId)) return true;
  const e = await emailOf(userId, email);
  if (e && ALL_PROJECT_EMAILS.has(e)) return true;
  const { data, error } = await supabaseAdmin.from('project_access').select('status,current_period_end')
    .eq('user_id', userId).eq('project', project).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  if (!['active', 'trialing'].includes(String(data.status))) return false;
  return !data.current_period_end || Date.parse(data.current_period_end) > Date.now();
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
