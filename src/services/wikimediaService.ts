// Retrieves candidate diagram images from Wikimedia Commons — a public,
// no-API-key-required repository where everything hosted is already under
// a free license (Commons' own hosting policy), so no separate copyright
// check is needed here, just surfacing the attribution Commons provides.

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// Wikimedia throttles/blocks anonymous-looking requests — a descriptive
// User-Agent identifying the app and a contact point is required by their
// API etiquette guidelines, not optional.
const USER_AGENT = 'LastMind/1.0 (https://lastmind.co.uk; contact: jamesmwood@btinternet.com)';

export interface WikimediaCandidate {
  title: string;
  thumbUrl: string;
  descriptionUrl: string;
  artist: string | null;
  licenseShortName: string | null;
}

function stripHtml(value: string | undefined | null): string | null {
  if (!value) return null;
  const stripped = value.replace(/<[^>]*>/g, '').trim();
  return stripped || null;
}

/**
 * Searches Commons for images matching `query`, returning up to `limit`
 * candidates. Requests a rasterized thumbnail (iiurlwidth) specifically so
 * SVG-original diagrams — the common case for clean economics/science
 * diagrams — come back as a plain raster image, since Claude's vision
 * input doesn't accept image/svg+xml.
 */
export async function searchWikimediaImages(query: string, limit = 5): Promise<WikimediaCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6', // File: namespace
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1024',
    format: 'json',
    origin: '*',
  });

  const resp = await fetch(`${COMMONS_API}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!resp.ok) {
    throw new Error(`Wikimedia search failed: HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== 'object') return [];

  const candidates: WikimediaCandidate[] = [];
  for (const page of Object.values(pages) as any[]) {
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    // Commons' `mime` field describes the ORIGINAL file, not the
    // thumbnail — an SVG original still reports "image/svg+xml" even
    // though `thumburl` (requested via iiurlwidth) is a rasterized PNG.
    // There's no separate "thumbmime" field, so detect the thumbnail's
    // actual format from its own URL extension instead — and only trust
    // `thumburl` specifically (never fall back to the original `url`,
    // which could be an SVG/PDF/TIFF Claude's vision input can't read).
    const thumbUrl: string | undefined = info.thumburl;
    const extMatch = thumbUrl ? thumbUrl.match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i) : null;
    if (!thumbUrl || !extMatch) continue;

    // Scanned multi-page documents (PDF/DjVu) get a valid raster thumbnail
    // of their cover page — technically viewable, but never an actual
    // diagram, and text search regularly surfaces them for any query that
    // matches their OCR'd contents. Filtering by source title (not the
    // thumbnail's own format, which is legitimately a PNG/JPEG either way)
    // keeps these out of the — costed — verification call entirely.
    if (/\.(pdf|djvu|tiff?)$/i.test((page.title || '').replace(/^File:/i, ''))) continue;

    const meta = info.extmetadata || {};
    candidates.push({
      title: page.title || 'Untitled',
      thumbUrl,
      descriptionUrl: info.descriptionurl || info.descriptionshorturl || thumbUrl,
      artist: stripHtml(meta.Artist?.value),
      licenseShortName: stripHtml(meta.LicenseShortName?.value),
    });
  }
  return candidates;
}

export interface FetchedImage {
  base64Data: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const MIME_MAP: Record<string, FetchedImage['mediaType']> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

/** Downloads and base64-encodes one candidate's thumbnail. Returns null on any failure — callers should tolerate individual candidates failing. */
export async function fetchImageAsBase64(url: string): Promise<FetchedImage | null> {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return null;

    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const mediaType = MIME_MAP[contentType];
    if (!mediaType) return null;

    const contentLength = resp.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

    return { base64Data: buffer.toString('base64'), mediaType };
  } catch {
    return null;
  }
}
