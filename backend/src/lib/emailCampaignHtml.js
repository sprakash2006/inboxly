// Renders an email campaign's structured content into the HTML that is sent.
//
// The AI never writes HTML itself: it returns plain fields (headline,
// paragraphs, bullets, a call to action), and this file lays them out. That
// keeps every email on one tested, mail-client-safe layout (tables and inline
// styles, which Gmail and Outlook need), and means nothing a model produces
// can inject markup or scripts into what customers receive.

const HEX = /^#[0-9a-f]{6}$/i;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only plain web links become buttons; anything else (javascript:, data:)
// is dropped rather than escaped into a clickable link.
export function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const lines = (arr, max, len) => (Array.isArray(arr) ? arr : [])
  .map((x) => clip(x, len)).filter(Boolean).slice(0, max);

// Coerces anything (AI output, a request body) into the one shape the
// renderer understands, with every field bounded.
export function normalizeContent(c = {}) {
  return {
    headline: clip(c.headline, 120),
    paragraphs: lines(c.paragraphs, 8, 1200),
    bullets: lines(c.bullets, 8, 200),
    ctaText: clip(c.ctaText, 40),
    ctaUrl: safeUrl(c.ctaUrl) || '',
    signoff: clip(c.signoff, 200),
  };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
const BULLET_RE = /^\s*(?:[-*•▪◦]|\d+[.)])\s+/;

// The no-AI layout: turns what the user typed into the same structure the AI
// returns, so a plain message still goes out as a designed email. A short
// first line becomes the headline, "- item" lines become a list, and the
// first link becomes the button.
export function contentFromMessage(message = '') {
  const text = String(message).replace(/\r\n/g, '\n').trim();
  const urlMatch = text.match(URL_RE);
  const ctaUrl = urlMatch ? urlMatch[0].replace(/[.,!?]+$/, '') : '';

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let headline = '';
  const first = blocks[0]?.split('\n') || [];
  if (blocks.length > 1 && first.length === 1 && first[0].length <= 80 && !BULLET_RE.test(first[0])) {
    headline = first[0].replace(/[:.]$/, '');
    blocks.shift();
  }

  const paragraphs = [];
  const bullets = [];
  for (const block of blocks) {
    const rows = block.split('\n');
    const prose = [];
    for (const row of rows) {
      if (BULLET_RE.test(row)) bullets.push(row.replace(BULLET_RE, '').trim());
      else prose.push(row.trim());
    }
    const p = prose.join(' ').trim();
    // A paragraph that is only the link is shown as the button instead.
    if (p && p.replace(ctaUrl, '').trim()) paragraphs.push(p);
  }

  return normalizeContent({
    headline,
    paragraphs,
    bullets,
    ctaText: ctaUrl ? 'Learn more' : '',
    ctaUrl,
  });
}

// Fills {{name}}, {{first_name}} and {{email}}. Values are escaped, so a
// recipient called "<b>Bob</b>" is printed, not rendered.
export function personalize(html, { name, email } = {}) {
  const full = String(name || '').trim();
  const first = full.split(/\s+/)[0] || '';
  const vals = {
    name: escapeHtml(full || 'there'),
    first_name: escapeHtml(first || 'there'),
    email: escapeHtml(email || ''),
  };
  return String(html).replace(/\{\{\s*(name|first_name|email)\s*\}\}/gi, (_, k) => vals[k.toLowerCase()]);
}

// Plain-text personalisation for the subject line.
export function personalizeText(text, { name, email } = {}) {
  const full = String(name || '').trim();
  const vals = { name: full || 'there', first_name: full.split(/\s+/)[0] || 'there', email: email || '' };
  return String(text).replace(/\{\{\s*(name|first_name|email)\s*\}\}/gi, (_, k) => vals[k.toLowerCase()]);
}

// ─── Colour ─────────────────────────────────────────────────────────────────
//
// One accent colour, used sparingly: the rule across the top of the card and
// the list markers in the accent itself; the button and links in the accent
// deepened just enough for WCAG AA (4.5:1) against white, so a light accent
// like gold still gives a readable button. Everything else is neutral grey.

// Curated themes Gemini chooses from to match the message's mood.
export const THEMES = {
  teal: '#0d9488',
  ocean: '#2563eb',
  violet: '#7c3aed',
  rose: '#db2777',
  festive: '#ea580c',
  gold: '#d97706',
  emerald: '#059669',
  crimson: '#dc2626',
  midnight: '#1e293b',
};

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (hex, withHex, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
};

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK_DARK = '#111827';

// Darkens a colour in small steps until white reads on it at 4.5:1.
function deepen(hex) {
  let d = hex;
  for (let i = 0; i < 12 && contrast(d, '#ffffff') < 4.5; i += 1) d = mix(d, INK_DARK, 0.1);
  return d;
}

export function palette(accentColor) {
  const accent = HEX.test(accentColor || '') ? accentColor.toLowerCase() : THEMES.teal;
  const deep = deepen(accent);
  return { accent, button: deep, ink: '#ffffff', deep };
}

// ─── Layout ─────────────────────────────────────────────────────────────────
//
// Deliberately quiet: a white page, a serif headline at regular weight, a
// clean sans body, and the accent used only where the eye should land (the
// top rule, list markers, links and the one button). Georgia ships with
// every mail client; Inter loads where web fonts are supported (Apple Mail,
// iOS) and otherwise falls back to Helvetica or Arial.

const SANS = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";
const BODY = '#3f4a5a';
const MUTED = '#8a94a3';
const RULE = '#e8ebef';

// Lets a line carry **bold** without allowing any other markup.
const inline = (s, color = INK_DARK) =>
  escapeHtml(s).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${color};font-weight:600;">$1</strong>`);

// A greeting ("Hi {{first_name}},") opens the body on its own line.
const isGreeting = (t) => t.length <= 40 && /^(hi|hello|hey|dear|namaste|greetings)\b/i.test(t);

export function renderEmailHtml({ content, accentColor, preheader, brandName, logoUrl }) {
  const c = normalizeContent(content);
  const p = palette(accentColor);
  const brandText = clip(brandName, 60) || 'Inboxly';
  const brand = escapeHtml(brandText);
  const logo = safeUrl(logoUrl);
  const pre = clip(preheader, 160);

  const paras = [...c.paragraphs];
  const greeting = paras.length && isGreeting(paras[0]) ? paras.shift() : '';
  const text = (t, extra = '') =>
    `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.75;color:${BODY};${extra}">${inline(t, INK_DARK)}</p>`;

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${brand}" height="28" style="display:block;height:28px;max-width:160px;border:0;">`
    : `<span style="font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:0.01em;color:${INK_DARK};">${brand}</span>`;

  const headline = c.headline
    ? `<h1 style="margin:0 0 22px;font-family:${SERIF};font-size:27px;line-height:1.3;font-weight:400;color:${INK_DARK};">${escapeHtml(c.headline.replace(/\*\*/g, ''))}</h1>`
    : '';

  const list = c.bullets.length ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 22px;">${c.bullets.map((b) => `
              <tr>
                <td width="20" valign="top" style="padding:11px 0 0;"><div style="width:6px;height:6px;border-radius:3px;background:${p.accent};font-size:0;line-height:0;">&nbsp;</div></td>
                <td valign="top" style="padding:3px 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${BODY};">${inline(b, INK_DARK)}</td>
              </tr>`).join('')}
            </table>` : '';

  const url = c.ctaUrl ? escapeHtml(c.ctaUrl) : '';
  const cta = url ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 30px;">
              <tr><td bgcolor="${p.button}" style="border-radius:6px;background:${p.button};">
                <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:0.01em;color:${p.ink};text-decoration:none;border-radius:6px;">${escapeHtml(c.ctaText || 'Learn more')}</a>
              </td></tr>
            </table>` : '';

  const sign = (c.signoff || `Warm regards,\n${brandText}`).split('\n').map((l) => l.trim()).filter(Boolean);
  const signoff = `<p style="margin:8px 0 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${BODY};">${sign.map((l) => inline(l)).join('<br>')}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.headline || brandText)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @media (max-width:620px){
    .card-pad{padding:32px 24px !important}
    h1{font-size:24px !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(pre)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4f5f7" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:40px 16px 48px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;">
      <tr><td style="padding:0 2px 18px;">${header}</td></tr>
      <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${RULE};border-top:3px solid ${p.accent};border-radius:4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="card-pad" style="padding:44px 48px 40px;">
            ${headline}
            ${greeting ? text(greeting, `color:${INK_DARK};`) : ''}
            ${paras.map((t) => text(t)).join('\n            ')}${list}${cta}
            <div style="height:1px;background:${RULE};margin:8px 0 22px;font-size:0;line-height:0;">&nbsp;</div>
            ${signoff}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 4px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED};">
        You are receiving this email because you are in touch with ${brand}.
        To stop receiving these emails, reply with &ldquo;unsubscribe&rdquo;.
        ${url ? `<br>Button not working? Open <a href="${url}" target="_blank" style="color:${p.deep};">${escapeHtml(c.ctaUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 60))}</a>` : ''}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
