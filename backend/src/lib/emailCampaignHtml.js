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

// Lets a line carry **bold** without allowing any other markup.
const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function renderEmailHtml({ content, accentColor, preheader, brandName, logoUrl }) {
  const c = normalizeContent(content);
  const accent = HEX.test(accentColor || '') ? accentColor : '#0d9488';
  const brand = escapeHtml(clip(brandName, 60) || 'Inboxly');
  const logo = safeUrl(logoUrl);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const paragraphs = c.paragraphs.map((p) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">${inline(p)}</p>`).join('');

  const bullets = c.bullets.length ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;">
      ${c.bullets.map((b) => `
      <tr>
        <td width="28" valign="top" style="padding:6px 0;">
          <div style="width:20px;height:20px;border-radius:10px;background:${accent};color:#ffffff;font-size:12px;line-height:20px;text-align:center;font-weight:700;">&#10003;</div>
        </td>
        <td valign="top" style="padding:6px 0 6px 6px;font-size:15px;line-height:1.55;color:#334155;">${inline(b)}</td>
      </tr>`).join('')}
    </table>` : '';

  const cta = c.ctaUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr><td style="border-radius:10px;background:${accent};">
        <a href="${escapeHtml(c.ctaUrl)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(c.ctaText || 'Learn more')} &rarr;</a>
      </td></tr>
    </table>` : '';

  const signoff = c.signoff
    ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">${inline(c.signoff).replace(/\n/g, '<br>')}</p>`
    : `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">Warm regards,<br><strong>${brand}</strong></p>`;

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${brand}" height="36" style="display:inline-block;height:36px;max-width:160px;border:0;vertical-align:middle;">`
    : `<span style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${brand}</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(c.headline || brandName || '')}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(clip(preheader, 160))}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
      <tr><td style="padding:0 4px 16px;">${header}</td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:32px 32px 28px;">
            ${c.headline ? `<h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">${inline(c.headline)}</h1>` : ''}
            ${paragraphs}
            ${bullets}
            ${cta}
            ${signoff}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">
        You are receiving this email because you are in touch with ${brand}.<br>
        Not interested? Just reply with &ldquo;unsubscribe&rdquo; and we will take you off the list.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
