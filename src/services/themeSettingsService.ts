import { supabaseAdmin } from './supabaseAdmin';

// A user's own colour customisation - free for every tier, live-applied
// client-side (see learn/index.html's applyTheme), just persisted here so
// it follows the account across devices instead of resetting per-browser.
// Only three levers by design: text (drives both --text and --accent
// together), panel (the sidebar and every other panel-styled surface),
// and background - either a Plain/Wood-textured base tint (the birch
// default), or one of the named image presets in IMAGE_BG_TEXTURES (see
// learn/index.html's THEME_PRESETS/THEME_IMAGE_BACKGROUNDS - 'havnstad-
// village' is the first one, a blurred-behind-the-sidebar village scene).
export interface ThemeSettings {
  textColor: string;
  panelColor: string;
  bgColor: string;
  bgTexture: string;
}

// Every bgTexture value the frontend actually knows how to render. Kept
// here (not just client-side) so a malformed/stale value can't get
// persisted and then silently render as nothing on the next load -
// same defensive stance as HEX_RE below for the colour fields.
const IMAGE_BG_TEXTURES = ['havnstad-village'];
const VALID_BG_TEXTURES = ['plain', 'wood', ...IMAGE_BG_TEXTURES];

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
    bgTexture: VALID_BG_TEXTURES.includes(data.bg_texture) ? data.bg_texture : 'wood',
  };
}

export async function setThemeSettings(userId: string, incoming: Partial<ThemeSettings>): Promise<ThemeSettings> {
  const current = await getThemeSettings(userId);
  const merged: ThemeSettings = {
    textColor: HEX_RE.test(incoming.textColor || '') ? (incoming.textColor as string) : current.textColor,
    panelColor: HEX_RE.test(incoming.panelColor || '') ? (incoming.panelColor as string) : current.panelColor,
    bgColor: HEX_RE.test(incoming.bgColor || '') ? (incoming.bgColor as string) : current.bgColor,
    bgTexture: VALID_BG_TEXTURES.includes(incoming.bgTexture || '') ? (incoming.bgTexture as string) : current.bgTexture,
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
