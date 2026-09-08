import { supabaseAdmin } from './supabaseAdmin';

// A user's own colour customisation - free for every tier, live-applied
// client-side (see learn/index.html's applyTheme), just persisted here so
// it follows the account across devices instead of resetting per-browser.
// Only three levers by design: text (drives both --text and --accent
// together), panel (the sidebar and every other panel-styled surface),
// and background (a Plain/Wood-textured base tint - where the birch
// default lives).
export interface ThemeSettings {
  textColor: string;
  panelColor: string;
  bgColor: string;
  bgTexture: 'plain' | 'wood';
}

const DEFAULTS: ThemeSettings = {
  textColor: '#E6D7B0',
  panelColor: '#4E1B26',
  bgColor: '#D9C398',
  bgTexture: 'wood',
};

// Stored as plain hex strings, not structured colour objects - the only
// thing that ever touches them is CSS custom properties, so there's
// nothing to gain from parsing them server-side. Validated here regardless
// (never trust a client-supplied string straight into a JSON column even
// when nothing downstream currently interprets it as anything other than
// a CSS value) - a malformed value is silently dropped in favour of
// whatever's already saved, rather than rejecting the whole request over
// one bad field.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function getThemeSettings(userId: string): Promise<ThemeSettings> {
  const { data, error } = await supabaseAdmin
    .from('theme_settings')
    .select('text_color, panel_color, bg_color, bg_texture')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return {
    textColor: data.text_color,
    panelColor: data.panel_color,
    bgColor: data.bg_color,
    bgTexture: data.bg_texture === 'plain' ? 'plain' : 'wood',
  };
}

export async function setThemeSettings(userId: string, incoming: Partial<ThemeSettings>): Promise<ThemeSettings> {
  const current = await getThemeSettings(userId);
  const merged: ThemeSettings = {
    textColor: HEX_RE.test(incoming.textColor || '') ? (incoming.textColor as string) : current.textColor,
    panelColor: HEX_RE.test(incoming.panelColor || '') ? (incoming.panelColor as string) : current.panelColor,
    bgColor: HEX_RE.test(incoming.bgColor || '') ? (incoming.bgColor as string) : current.bgColor,
    bgTexture: incoming.bgTexture === 'plain' || incoming.bgTexture === 'wood' ? incoming.bgTexture : current.bgTexture,
  };
  const { error } = await supabaseAdmin
    .from('theme_settings')
    .upsert({
      user_id: userId,
      text_color: merged.textColor,
      panel_color: merged.panelColor,
      bg_color: merged.bgColor,
      bg_texture: merged.bgTexture,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return merged;
}
