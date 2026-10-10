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
// One accent colour drives the whole email, and everything else is derived
// from it so the result is always harmonious:
//   - an analogous partner hue (28° round the wheel) for the hero gradient
//   - light tints of the accent for the page, highlight box and borders
//   - a deepened accent for emphasis text, darkened until it passes WCAG AA
//   - the text colour on the accent (white or near-black) picked by contrast,
//     so a light amber gets dark text and navy gets white
// Neutrals are slate, a cool grey that sits well under every accent.

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

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l].map((v) => v * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (x) => {
    let t = x;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map((v) => v * 255);
}

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

const INK_DARK = '#0f172a';

export function palette(accentColor) {
  const accent = HEX.test(accentColor || '') ? accentColor.toLowerCase() : THEMES.teal;
  const [h, s, l] = rgbToHsl(hexToRgb(accent));
  // Warm hues (red to gold) turn toward red, since turning toward yellow
  // washes them out to neon; every other hue turns 22° forward (teal to
  // blue, blue to indigo). The partner is never lighter than the accent, so
  // text that reads on one end of the gradient reads on the other.
  const shift = h <= 70 ? -12 : 22;
  const partner = rgbToHex(hslToRgb([h + shift, s, Math.min(l, 0.6)]));
  // White text on the accent whenever it reaches 3:1 (WCAG's bar for large
  // bold text: the headline and button), checked against the lighter end of
  // the gradient; near-black only for accents too light for white.
  const lighter = luminance(partner) > luminance(accent) ? partner : accent;
  const ink = contrast('#ffffff', lighter) >= 3 ? '#ffffff' : INK_DARK;
  const tint = mix(accent, '#ffffff', 0.92);
  let deep = accent;
  for (let i = 0; i < 8 && contrast(deep, tint) < 4.5; i += 1) deep = mix(deep, INK_DARK, 0.18);
  return {
    accent,
    partner,
    ink,
    inkSoft: ink === '#ffffff' ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.75)',
    deep,
    tint,
    tintBorder: mix(accent, '#ffffff', 0.78),
    glow: mix(accent, '#ffffff', 0.6),
    shadow: mix(accent, '#ffffff', 0.88),
    page: mix(accent, '#f8fafc', 0.95),
  };
}

// ─── Layout ─────────────────────────────────────────────────────────────────

// Lets a line carry **bold** without allowing any other markup.
const inline = (s, color = INK_DARK) =>
  escapeHtml(s).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${color};font-weight:700;">$1</strong>`);

// A greeting ("Hi {{first_name}},") is set apart from the body copy.
const isGreeting = (t) => t.length <= 40 && /^(hi|hello|hey|dear|namaste|greetings)\b/i.test(t);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderEmailHtml({ content, accentColor, preheader, brandName, logoUrl }) {
  const c = normalizeContent(content);
  const p = palette(accentColor);
  const brandText = clip(brandName, 60) || 'Inboxly';
  const brand = escapeHtml(brandText);
  const logo = safeUrl(logoUrl);
  const pre = clip(preheader, 160);

  const paras = [...c.paragraphs];
  const greeting = paras.length && isGreeting(paras[0]) ? paras.shift() : '';

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${brand}" height="34" style="display:block;height:34px;max-width:170px;border:0;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="34" height="34" align="center" valign="middle" bgcolor="${p.accent}" style="width:34px;height:34px;border-radius:10px;background:${p.accent};color:${p.ink};font-size:16px;font-weight:800;">${escapeHtml(brandText.charAt(0).toUpperCase())}</td>
          <td style="padding-left:10px;font-size:17px;font-weight:800;color:${INK_DARK};letter-spacing:-0.02em;">${brand}</td>
        </tr></table>`;

  // The headline sits on the accent gradient; Outlook, which ignores
  // gradients, falls back to the solid bgcolor. With no headline the card
  // opens with a thin accent rule instead.
  const hero = c.headline ? `
          <tr><td class="hero-pad" bgcolor="${p.accent}" style="background:${p.accent};background-image:linear-gradient(135deg,${p.accent} 0%,${p.partner} 100%);border-radius:18px 18px 0 0;padding:40px 36px 36px;">
            <h1 style="margin:0;font-size:28px;line-height:1.25;font-weight:800;color:${p.ink};letter-spacing:-0.02em;">${escapeHtml(c.headline.replace(/\*\*/g, ''))}</h1>
            ${pre ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:${p.inkSoft};">${escapeHtml(pre)}</p>` : ''}
          </td></tr>` : `
          <tr><td style="height:6px;background:${p.accent};border-radius:18px 18px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  const body = paras.map((t) =>
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#334155;">${inline(t, p.deep)}</p>`).join('\n            ');

  const highlights = c.bullets.length ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 26px;background:${p.tint};border:1px solid ${p.tintBorder};border-radius:14px;">
              <tr><td style="padding:18px 20px 8px;">${c.bullets.map((b) => `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px;"><tr>
                  <td width="30" valign="top"><div style="width:22px;height:22px;border-radius:11px;background:${p.accent};color:${p.ink};font-size:12px;line-height:22px;text-align:center;font-weight:800;">&#10003;</div></td>
                  <td valign="top" style="padding:1px 0 0 4px;font-size:15px;line-height:1.55;color:#1e293b;font-weight:500;">${inline(b, p.deep)}</td>
                </tr></table>`).join('')}
              </td></tr>
            </table>` : '';

  const url = c.ctaUrl ? escapeHtml(c.ctaUrl) : '';
  const shortUrl = escapeHtml(c.ctaUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50));
  const cta = url ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 10px;">
              <tr><td align="center" bgcolor="${p.accent}" style="border-radius:12px;background:${p.accent};background-image:linear-gradient(135deg,${p.accent},${p.partner});box-shadow:0 6px 16px ${p.glow};">
                <a href="${url}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:17px;font-weight:700;color:${p.ink};text-decoration:none;border-radius:12px;">${escapeHtml(c.ctaText || 'Learn more')}&nbsp;&rarr;</a>
              </td></tr>
            </table>
            <p style="margin:0 0 26px;text-align:center;font-size:12px;color:#94a3b8;">or open <a href="${url}" target="_blank" style="color:${p.deep};text-decoration:underline;">${shortUrl}</a></p>` : '';

  const sign = (c.signoff || `Warm regards,\n${brandText}`).split('\n').map((l) => l.trim()).filter(Boolean);
  const signoff = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;border-top:1px solid #e2e8f0;">
              <tr><td style="padding-top:22px;font-size:15px;line-height:1.6;color:#475569;">
                ${sign.slice(0, -1).map((l) => inline(l)).join('<br>')}${sign.length > 1 ? '<br>' : ''}<strong style="color:${INK_DARK};">${inline(sign[sign.length - 1] || brandText)}</strong>
              </td></tr>
            </table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.headline || brandText)}</title>
<style>
  @media (max-width:620px){
    .card-pad{padding:28px 22px !important}
    .hero-pad{padding:30px 22px 26px !important}
    h1{font-size:24px !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${p.page};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(pre)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${p.page}" style="background:${p.page};">
  <tr><td align="center" style="padding:32px 14px 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;font-family:${FONT};">
      <tr><td style="padding:0 4px 20px;">${header}</td></tr>
      <tr><td style="border-radius:18px;background:#ffffff;box-shadow:0 1px 3px rgba(15,23,42,0.06),0 12px 32px ${p.shadow};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${hero}
          <tr><td class="card-pad" style="padding:34px 36px 32px;">
            ${greeting ? `<p style="margin:0 0 16px;font-size:17px;line-height:1.5;font-weight:700;color:${INK_DARK};">${inline(greeting)}</p>` : ''}
            ${body}${highlights}${cta}${signoff}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 16px 0;text-align:center;font-size:12px;line-height:1.7;color:#94a3b8;">
        <span style="color:#64748b;font-weight:600;">${brand}</span><br>
        You are receiving this email because you are in touch with ${brand}.<br>
        Not interested? Reply with &ldquo;unsubscribe&rdquo; and we will take you off the list.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
