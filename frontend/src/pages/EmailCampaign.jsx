// Email campaigns: the builder (audience → message → AI rewrite → live
// preview → send or schedule), the list shown on the Campaigns page's Email
// tab, and the per-campaign report.
//
// The HTML is always rendered by the server (/email-campaigns/preview), so the
// preview on the right is byte-for-byte what recipients get, with sample
// values in the {{name}} placeholders.
import { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../components/Icons.jsx';
import { Btn } from '../components/Btn.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { notify, confirmDialog } from '../components/Feedback.jsx';
import { wFetch } from '../lib/api.js';
import { can } from '../lib/permissions.js';
import { useIsMobile } from '../lib/useMediaQuery.js';
import { useRealtime, useThrottledCallback } from '../lib/realtime.js';

const card = { background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 'var(--rl)', boxShadow: 'var(--card-shadow)' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 };
const input = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--bd2, var(--bd))', background: 'var(--surf)', color: 'var(--t1)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const hint = { fontSize: 11.5, color: 'var(--t3)', marginTop: 6, lineHeight: 1.5 };
const H = "'Space Grotesk',sans-serif";

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

const ACCENTS = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0f172a'];
const TONES = [
  ['friendly', 'Friendly'],
  ['professional', 'Professional'],
  ['promotional', 'Promotional'],
  ['short', 'Short & crisp'],
];

const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

// ─── CSV ────────────────────────────────────────────────────────────────────

// Small RFC 4180 reader: quoted fields, escaped quotes, commas and newlines
// inside quotes. Enough for exports from Excel, Google Sheets and CRMs.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Finds the email and name columns by header; without a header row, the
// first column holding an address is used.
function recipientsFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { list: [], invalid: 0 };
  const head = rows[0].map(h => h.trim().toLowerCase());
  let emailCol = head.findIndex(h => h.includes('email') || h === 'e-mail' || h === 'mail');
  let nameCol = head.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname' || h === 'customer');
  const firstCol = head.findIndex(h => h.includes('first'));
  const lastCol = head.findIndex(h => h.includes('last'));
  let body = rows.slice(1);
  if (emailCol < 0) {
    emailCol = rows[0].findIndex(isEmail);
    body = rows;
    nameCol = -1;
  }
  if (emailCol < 0) return { list: [], invalid: rows.length, noEmailColumn: true };
  const list = [];
  let invalid = 0;
  for (const r of body) {
    const email = String(r[emailCol] || '').trim().toLowerCase();
    if (!isEmail(email)) { invalid++; continue; }
    const name = nameCol >= 0 ? r[nameCol]
      : [firstCol >= 0 ? r[firstCol] : '', lastCol >= 0 ? r[lastCol] : ''].join(' ');
    list.push({ email, name: String(name || '').trim() || null });
  }
  return { list, invalid };
}

// "Priya <priya@x.com>", "priya@x.com", comma- or line-separated.
function recipientsFromText(text) {
  const list = [];
  let invalid = 0;
  for (const part of String(text).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)<([^>]+)>$/);
    const email = (m ? m[2] : part).trim().toLowerCase();
    if (!isEmail(email)) { invalid++; continue; }
    list.push({ email, name: m ? m[1].replace(/["']/g, '').trim() || null : null });
  }
  return { list, invalid };
}

const SAMPLE_CSV = 'name,email\nPriya Sharma,priya@example.com\nRahul Verma,rahul@example.com\n';

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'email_recipients_sample.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Building blocks ────────────────────────────────────────────────────────

const Section = ({ n, title, sub, children, right }) => (
  <div style={{ ...card, padding: '20px 22px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--gbg)', border: '1px solid var(--gbd)', color: 'var(--green)', fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontFamily: H, fontSize: 15.5, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{title}</h3>
        {sub && <p style={{ fontSize: 12.5, color: 'var(--t2)', margin: '3px 0 0' }}>{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const Pill = ({ on, onClick, icon, children }) => (
  <button type="button" onClick={onClick}
    style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${on ? 'var(--green)' : 'var(--bd)'}`, background: on ? 'var(--gbg)' : 'transparent', color: on ? 'var(--green)' : 'var(--t2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
    {icon && <I n={icon} s={13} c={on ? 'var(--green)' : 'var(--t3)'} />}{children}
  </button>
);

const Notice = ({ tone = 'info', children }) => {
  const t = {
    info: ['rgba(14,165,233,.07)', 'rgba(14,165,233,.25)', '#0369a1'],
    ok: ['var(--gbg)', 'var(--gbd)', 'var(--green)'],
    warn: ['rgba(245,158,11,.09)', 'rgba(245,158,11,.3)', '#b45309'],
    err: ['rgba(239,68,68,.07)', 'rgba(239,68,68,.25)', '#dc2626'],
  }[tone];
  return <div style={{ padding: '9px 12px', borderRadius: 8, background: t[0], border: `1px solid ${t[1]}`, color: t[2], fontSize: 12.5, lineHeight: 1.5 }}>{children}</div>;
};

// The email as it lands in an inbox: sender, subject and the real HTML in a
// sandboxed frame (no scripts, no same-origin access).
const InboxPreview = ({ html, subject, preheader, fromName, fromEmail, loading }) => {
  const [device, setDevice] = useState('desktop');
  const initial = (fromName || 'I').trim().charAt(0).toUpperCase();
  const fill = (s) => String(s || '').replace(/\{\{\s*first_name\s*\}\}/gi, 'Priya').replace(/\{\{\s*name\s*\}\}/gi, 'Priya Sharma').replace(/\{\{\s*email\s*\}\}/gi, 'priya@example.com');
  return (
    <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surf2)' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#f87171', '#fbbf24', '#34d399'].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />)}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', flex: 1 }}>Live preview</span>
        {loading && <I n="loader" s={13} c="var(--t3)" />}
        <div style={{ display: 'flex', border: '1px solid var(--bd)', borderRadius: 7, overflow: 'hidden' }}>
          {[['desktop', 'monitor'], ['mobile', 'smartphone']].map(([d, ic]) => (
            <button key={d} type="button" onClick={() => setDevice(d)} title={d === 'desktop' ? 'Desktop' : 'Mobile'}
              style={{ padding: '4px 8px', border: 'none', background: device === d ? 'var(--gbg)' : 'var(--surf)', cursor: 'pointer', display: 'flex' }}>
              <I n={ic} s={14} c={device === d ? 'var(--green)' : 'var(--t3)'} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}>
        <p style={{ fontFamily: H, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: '0 0 10px', wordBreak: 'break-word' }}>{fill(subject) || <span style={{ color: 'var(--t3)', fontWeight: 500 }}>Your subject line</span>}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: 'linear-gradient(135deg,#2dd4bf,#0d9488)', color: '#fff', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initial}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 12.5, color: 'var(--t1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{fromName || 'Your business'}</strong>{fromEmail && <span style={{ color: 'var(--t3)' }}> &lt;{fromEmail}&gt;</span>}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--t3)', margin: 0 }}>to Priya Sharma (sample recipient)</p>
          </div>
        </div>
        {preheader && <p style={{ fontSize: 11.5, color: 'var(--t3)', margin: '8px 0 0' }}>Inbox preview text: <span style={{ color: 'var(--t2)' }}>{fill(preheader)}</span></p>}
      </div>
      <div style={{ flex: 1, minHeight: 420, background: '#e2e8f0', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        {html ? (
          <iframe title="Email preview" sandbox="" srcDoc={html}
            style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: '100%', height: '100%', minHeight: 420, border: 'none', background: '#f1f5f9', transition: 'width .2s' }} />
        ) : (
          <div style={{ alignSelf: 'center', textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: 24 }}>
            <I n="mail" s={30} c="var(--t3)" />
            <p style={{ marginTop: 10 }}>Start writing your message and the email appears here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Audience ───────────────────────────────────────────────────────────────

const AudiencePicker = ({ contacts, contactsLoading, selectedIds, setSelectedIds, extra, setExtra }) => {
  const [mode, setMode] = useState('contacts');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [segments, setSegments] = useState(null);
  const [segmentId, setSegmentId] = useState('');
  const [segmentMsg, setSegmentMsg] = useState('');
  const [csvMsg, setCsvMsg] = useState(null);
  const [pasted, setPasted] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const withEmail = useMemo(() => contacts.filter(c => isEmail(c.email)), [contacts]);
  const tags = useMemo(() => [...new Set(withEmail.flatMap(c => c.tags || []))].sort(), [withEmail]);
  const q = search.trim().toLowerCase();
  const visible = withEmail.filter(c =>
    (!tag || (c.tags || []).includes(tag)) &&
    (!q || `${c.name} ${c.email}`.toLowerCase().includes(q)));
  const allVisibleOn = visible.length > 0 && visible.every(c => selectedIds.has(c.id));

  useEffect(() => {
    if (mode !== 'segment' || segments) return;
    wFetch('/segments').then(json).then(d => setSegments(Array.isArray(d) ? d : d.data || [])).catch(() => setSegments([]));
  }, [mode, segments]);

  const toggle = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    visible.forEach(c => (allVisibleOn ? n.delete(c.id) : n.add(c.id)));
    return n;
  });

  const pickSegment = async (sid) => {
    setSegmentId(sid);
    setSegmentMsg('');
    if (!sid) return;
    try {
      const d = await json(await wFetch(`/contacts?segmentId=${encodeURIComponent(sid)}&limit=all`));
      const rows = d.data ?? [];
      const ok = rows.filter(c => isEmail(c.email));
      setSelectedIds(prev => new Set([...prev, ...ok.map(c => c.id)]));
      setSegmentMsg(`Added ${ok.length} contact${ok.length === 1 ? '' : 's'} with an email address${rows.length > ok.length ? ` (${rows.length - ok.length} in this list have no email)` : ''}.`);
    } catch (e) {
      setSegmentMsg(e.message);
    }
  };

  const addExtra = (list) => setExtra(prev => {
    const m = new Map(prev.map(r => [r.email, r]));
    list.forEach(r => { if (!m.has(r.email)) m.set(r.email, r); });
    return [...m.values()];
  });

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setCsvMsg({ tone: 'err', text: 'That file is over 5 MB. Split it into smaller files.' }); return; }
    const { list, invalid, noEmailColumn } = recipientsFromCsv(await file.text());
    if (noEmailColumn) { setCsvMsg({ tone: 'err', text: 'No email column found. Add a column named "email".' }); return; }
    addExtra(list.map(r => ({ ...r, source: 'CSV' })));
    setCsvMsg({ tone: list.length ? 'ok' : 'warn', text: `Imported ${list.length} address${list.length === 1 ? '' : 'es'} from ${file.name}${invalid ? `. ${invalid} row${invalid === 1 ? '' : 's'} skipped (no valid email).` : '.'}` });
  };

  const addPasted = () => {
    const { list, invalid } = recipientsFromText(pasted);
    addExtra(list.map(r => ({ ...r, source: 'Added' })));
    setPasted('');
    notify(`Added ${list.length} address${list.length === 1 ? '' : 'es'}${invalid ? `, ${invalid} invalid skipped` : ''}.`, list.length ? 'success' : 'error');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Pill on={mode === 'contacts'} onClick={() => setMode('contacts')} icon="users">From contacts</Pill>
        <Pill on={mode === 'segment'} onClick={() => setMode('segment')} icon="layers">Smart list</Pill>
        <Pill on={mode === 'csv'} onClick={() => setMode('csv')} icon="upload">Import CSV</Pill>
        <Pill on={mode === 'paste'} onClick={() => setMode('paste')} icon="pencil">Type emails</Pill>
      </div>

      {mode === 'contacts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <span style={{ position: 'absolute', left: 10, top: 10 }}><I n="search" s={14} c="var(--t3)" /></span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" style={{ ...input, paddingLeft: 32 }} />
            </div>
            {tags.length > 0 && (
              <select value={tag} onChange={e => setTag(e.target.value)} style={{ ...input, width: 'auto', flex: '0 0 auto' }}>
                <option value="">All tags</option>
                {tags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
          <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--surf2)', borderBottom: '1px solid var(--bd)', fontSize: 12.5, fontWeight: 600, color: 'var(--t2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={allVisibleOn} onChange={toggleVisible} disabled={!visible.length} />
              Select all {visible.length} shown
              <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--t3)' }}>
                {contacts.length - withEmail.length > 0 && `${contacts.length - withEmail.length} contacts have no email`}
              </span>
            </label>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {contactsLoading ? <p style={{ padding: 16, fontSize: 12.5, color: 'var(--t3)' }}>Loading contacts…</p>
                : visible.length === 0 ? <p style={{ padding: 16, fontSize: 12.5, color: 'var(--t3)' }}>{withEmail.length ? 'No contacts match.' : 'None of your contacts has an email address yet. Import a CSV or type addresses instead.'}</p>
                : visible.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: selectedIds.has(c.id) ? 'var(--gbg)' : 'transparent' }}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggle(c.id)} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>{c.name || c.email}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--t3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</p>
                    </div>
                    {c.optedOut && <StatusBadge label="Opted out" tone="red" />}
                    {(c.tags || []).slice(0, 2).map(t => <StatusBadge key={t} label={t} tone="gray" />)}
                  </label>
                ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'segment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select value={segmentId} onChange={e => pickSegment(e.target.value)} style={input}>
            <option value="">{segments ? (segments.length ? 'Choose a smart list…' : 'No smart lists yet') : 'Loading…'}</option>
            {(segments || []).map(s => <option key={s.id} value={s.id}>{s.name} ({s.contactCount ?? 0} contacts)</option>)}
          </select>
          {segmentMsg && <Notice tone="ok">{segmentMsg}</Notice>}
        </div>
      )}

      {mode === 'csv' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { readFile(e.target.files[0]); e.target.value = ''; }} />
          <div onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
            style={{ border: `2px dashed ${dragging ? 'var(--green)' : 'var(--bd2, var(--bd))'}`, borderRadius: 12, padding: '26px 16px', textAlign: 'center', cursor: 'pointer', background: dragging ? 'var(--gbg)' : 'var(--surf2)', transition: 'all .15s' }}>
            <I n="upload" s={24} c="var(--green)" />
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)', margin: '8px 0 3px' }}>Drop a CSV here or click to browse</p>
            <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>Needs an <code>email</code> column; <code>name</code> is optional.</p>
          </div>
          <button type="button" onClick={downloadSample} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--green)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <I n="download" s={13} c="var(--green)" /> Download sample CSV
          </button>
          {csvMsg && <Notice tone={csvMsg.tone}>{csvMsg.text}</Notice>}
        </div>
      )}

      {mode === 'paste' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={4}
            placeholder={'priya@example.com, rahul@example.com\nAnita Rao <anita@example.com>'} style={{ ...input, resize: 'vertical' }} />
          <Btn size="sm" onClick={addPasted} disabled={!pasted.trim()} style={{ alignSelf: 'flex-end' }}><I n="plus" s={13} c="currentColor" /> Add addresses</Btn>
        </div>
      )}

      {extra.length > 0 && (
        <div style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2)' }}>{extra.length} imported or typed address{extra.length === 1 ? '' : 'es'}</span>
            <button type="button" onClick={() => setExtra([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>Clear</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto' }}>
            {extra.map(r => (
              <span key={r.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 6px 3px 9px', borderRadius: 14, background: 'var(--surf3)', fontSize: 11.5, color: 'var(--t2)' }}>
                {r.name ? `${r.name} · ` : ''}{r.email}
                <button type="button" onClick={() => setExtra(prev => prev.filter(x => x.email !== r.email))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><I n="x" s={12} c="var(--t3)" /></button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Builder ────────────────────────────────────────────────────────────────

const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function EmailCampaignBuilder({ onBack }) {
  const isMobile = useIsMobile();
  const me = useMemo(() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }, []);

  const [name, setName] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [extra, setExtra] = useState([]);

  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('friendly');
  const [accent, setAccent] = useState(ACCENTS[0]);
  // null = lay out the message as written; an object = the AI's version.
  const [content, setContent] = useState(null);
  const [aiMessage, setAiMessage] = useState('');
  const [undo, setUndo] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [aiNotice, setAiNotice] = useState('');

  const [preview, setPreview] = useState({ html: '', fromName: '', fromEmail: '', smtpReady: true });
  const [previewLoading, setPreviewLoading] = useState(false);

  const [when, setWhen] = useState('now');
  const [scheduleAt, setScheduleAt] = useState(() => toLocalInput(new Date(Date.now() + 3600_000)));
  const [testTo, setTestTo] = useState(me.email || '');
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messageRef = useRef(null);

  useEffect(() => {
    wFetch('/contacts?limit=all').then(json)
      .then(d => setContacts(Array.isArray(d) ? d : d.data || []))
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false));
  }, []);

  // Re-render the preview shortly after typing stops.
  useEffect(() => {
    if (!message.trim() && !content) { setPreview(p => ({ ...p, html: '' })); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const d = await json(await wFetch('/email-campaigns/preview', {
          method: 'POST', signal: ctrl.signal,
          body: JSON.stringify({ message, content, accentColor: accent, preheader }),
        }));
        setPreview(d);
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('[EmailCampaign] preview failed:', e.message);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [message, content, accent, preheader]);

  const recipients = useMemo(() => {
    const m = new Map();
    contacts.forEach(c => { if (selectedIds.has(c.id) && isEmail(c.email)) m.set(c.email.toLowerCase(), { email: c.email.toLowerCase(), name: c.name || null, contactId: c.id }); });
    extra.forEach(r => { if (!m.has(r.email)) m.set(r.email, { email: r.email, name: r.name || null }); });
    return [...m.values()];
  }, [contacts, selectedIds, extra]);

  const stale = content && message !== aiMessage;

  const rewrite = async () => {
    if (message.trim().length < 5) { setError('Write a few words of your message first, then let AI polish it.'); return; }
    setError(''); setAiNotice(''); setRewriting(true);
    try {
      const d = await json(await wFetch('/email-campaigns/compose', {
        method: 'POST', body: JSON.stringify({ message, tone, subject: subject || undefined }),
      }));
      setUndo({ content, subject, preheader });
      setContent(d.content);
      setAiMessage(message);
      if (d.subject) setSubject(d.subject);
      if (d.preheader) setPreheader(d.preheader);
      if (d.aiUsed) notify('Rewritten with AI. Check the preview on the right.', 'success');
      else setAiNotice(d.notice || 'AI is not available, so your message was laid out as written.');
    } catch (e) {
      setError(e.message);
    } finally {
      setRewriting(false);
    }
  };

  const undoRewrite = () => {
    if (!undo) return;
    setContent(undo.content); setSubject(undo.subject); setPreheader(undo.preheader);
    setUndo(null); setAiNotice('');
  };

  const insertToken = (token) => {
    const el = messageRef.current;
    if (!el) { setMessage(m => m + token); return; }
    const { selectionStart: s, selectionEnd: e } = el;
    setMessage(m => m.slice(0, s) + token + m.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; });
  };

  const draftBody = () => ({ message, content, accentColor: accent, preheader: preheader || null });

  const sendTest = async () => {
    if (!subject.trim()) { setError('Add a subject line before sending a test.'); return; }
    setTesting(true); setError('');
    try {
      await json(await wFetch('/email-campaigns/test', { method: 'POST', body: JSON.stringify({ ...draftBody(), subject, to: testTo.trim() }) }));
      notify(`Test email sent to ${testTo.trim()}.`, 'success');
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const problems = [
    !name.trim() && 'a campaign name',
    !recipients.length && 'at least one recipient',
    !subject.trim() && 'a subject line',
    !message.trim() && !content && 'a message',
  ].filter(Boolean);

  const send = async () => {
    if (problems.length) { setError(`Add ${problems.join(', ')}.`); return; }
    let scheduledAt = null;
    if (when === 'later') {
      const d = new Date(scheduleAt);
      if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) { setError('Pick a time in the future to schedule the campaign.'); return; }
      scheduledAt = d.toISOString();
    }
    const ok = await confirmDialog(
      `${when === 'later' ? 'Schedule' : 'Send'} "${subject}" to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}${when === 'later' ? ` on ${new Date(scheduleAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ' now'}?`,
      { title: when === 'later' ? 'Schedule campaign' : 'Send campaign', confirmLabel: when === 'later' ? 'Schedule' : 'Send now' },
    );
    if (!ok) return;
    setSending(true); setError('');
    try {
      const d = await json(await wFetch('/email-campaigns', {
        method: 'POST',
        body: JSON.stringify({ ...draftBody(), name: name.trim(), subject: subject.trim(), aiRewritten: !!content, scheduledAt, recipients }),
      }));
      notify(d.status === 'SCHEDULED' ? 'Campaign scheduled.' : `Sending to ${d.total} recipient${d.total === 1 ? '' : 's'}…`, 'success');
      onBack?.('email');
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '14px 16px' : '16px 28px', borderBottom: '1px solid var(--bd)', background: 'var(--surf)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => onBack?.('email')} aria-label="Back to campaigns"
          style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I n="arrowLeft" s={16} c="var(--t2)" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: H, fontSize: 19, fontWeight: 700, color: 'var(--t1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <I n="mail" s={18} c="var(--green)" /> New email campaign
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--t2)', margin: '2px 0 0' }}>Write once, let AI design it, and send it to your customers' inboxes.</p>
        </div>
        {!isMobile && (
          <span style={{ fontSize: 12.5, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <I n="users" s={14} c="var(--green)" /><strong style={{ color: 'var(--t1)' }}>{recipients.length}</strong> recipient{recipients.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(360px,0.95fr)', gap: 20, padding: isMobile ? 16 : '22px 28px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {!preview.smtpReady && (
              <Notice tone="warn">Email sending is not set up on this server yet (SMTP settings in backend/.env). You can design the campaign, but sending will fail.</Notice>
            )}

            <Section n={1} title="Campaign name" sub="Only you see this, on the campaigns list.">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali sale announcement" maxLength={120} style={input} />
            </Section>

            <Section n={2} title="Who gets it" sub="Pick contacts, use a smart list, import a CSV or type addresses."
              right={<StatusBadge label={`${recipients.length} selected`} tone={recipients.length ? 'green' : 'gray'} />}>
              <AudiencePicker contacts={contacts} contactsLoading={contactsLoading} selectedIds={selectedIds} setSelectedIds={setSelectedIds} extra={extra} setExtra={setExtra} />
            </Section>

            <Section n={3} title="Write the email" sub="Type it plainly. Rewrite with AI turns it into a designed email.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={label}>Subject line</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. {{first_name}}, our Diwali sale starts today" maxLength={150} style={input} />
                </div>
                <div>
                  <label style={label}>Preview text <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(optional, shown after the subject in the inbox)</span></label>
                  <input value={preheader} onChange={e => setPreheader(e.target.value)} placeholder="e.g. Flat 30% off everything, this week only" maxLength={160} style={input} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ ...label, margin: 0, flex: 1 }}>Message</label>
                    {['{{first_name}}', '{{name}}'].map(t => (
                      <button key={t} type="button" onClick={() => insertToken(t)} title="Insert at cursor; replaced with each recipient's name"
                        style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--surf2)', fontSize: 11, fontFamily: 'monospace', color: 'var(--green)', cursor: 'pointer' }}>+ {t}</button>
                    ))}
                  </div>
                  <textarea ref={messageRef} value={message} onChange={e => setMessage(e.target.value)} rows={9}
                    placeholder={'Hi {{first_name}},\n\nOur Diwali sale is live! Everything is 30% off until Sunday.\n\n- Free shipping on all orders\n- Easy 7-day returns\n\nShop now: https://yourstore.com/sale'}
                    style={{ ...input, resize: 'vertical', lineHeight: 1.55 }} />
                  <p style={hint}>Tip: a short first line becomes the heading, lines starting with "-" become a list, and a link becomes a button.</p>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'linear-gradient(135deg,rgba(45,212,191,.08),rgba(124,58,237,.06))', border: '1px solid var(--gbd)' }}>
                  <I n="sparkl" s={16} c="var(--green)" />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>Tone</span>
                  <select value={tone} onChange={e => setTone(e.target.value)} style={{ ...input, width: 'auto', padding: '7px 10px' }}>
                    {TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div style={{ flex: 1 }} />
                  {undo && <Btn variant="ghost" size="sm" onClick={undoRewrite}><I n="undo" s={13} c="currentColor" /> Undo</Btn>}
                  <Btn size="sm" onClick={rewrite} disabled={rewriting || !message.trim()} style={{ boxShadow: 'var(--glow)' }}>
                    <I n={rewriting ? 'loader' : 'sparkl'} s={14} c="currentColor" /> {rewriting ? 'Rewriting…' : content ? 'Rewrite again' : 'Rewrite with AI'}
                  </Btn>
                </div>
                {aiNotice && <Notice tone="warn">{aiNotice}</Notice>}
                {content && !stale && !aiNotice && <Notice tone="ok">The preview shows the AI version. Edit your message and rewrite again any time.</Notice>}
                {stale && (
                  <Notice tone="warn">
                    You changed the message after the rewrite, so the preview still shows the earlier AI version.{' '}
                    <button type="button" onClick={rewrite} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Rewrite again</button>{' or '}
                    <button type="button" onClick={() => { setContent(null); setUndo(null); }} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>use my text as written</button>.
                  </Notice>
                )}

                <div>
                  <label style={label}>Accent colour</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ACCENTS.map(c => (
                      <button key={c} type="button" onClick={() => setAccent(c)} aria-label={`Accent ${c}`}
                        style={{ width: 28, height: 28, borderRadius: 14, background: c, border: accent === c ? '3px solid var(--surf)' : '3px solid transparent', boxShadow: accent === c ? `0 0 0 2px ${c}` : 'none', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section n={4} title="Test and send">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={label}>Send a test to yourself first</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@example.com" style={input} />
                    <Btn variant="outline" onClick={sendTest} disabled={testing || !isEmail(testTo) || (!message.trim() && !content)} style={{ flexShrink: 0 }}>
                      <I n={testing ? 'loader' : 'send'} s={13} c="currentColor" /> {testing ? 'Sending…' : 'Send test'}
                    </Btn>
                  </div>
                </div>

                <div>
                  <label style={label}>When</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill on={when === 'now'} onClick={() => setWhen('now')} icon="send">Send now</Pill>
                    <Pill on={when === 'later'} onClick={() => setWhen('later')} icon="calendar">Schedule</Pill>
                    {when === 'later' && (
                      <input type="datetime-local" value={scheduleAt} min={toLocalInput(new Date())} onChange={e => setScheduleAt(e.target.value)} style={{ ...input, width: 'auto' }} />
                    )}
                  </div>
                </div>

                {error && <Notice tone="err">{error}</Notice>}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
                  <p style={{ fontSize: 12, color: 'var(--t3)', flex: 1, margin: 0, minWidth: 200 }}>
                    Sent from your workspace's email account, one by one. Opted-out contacts are skipped automatically.
                  </p>
                  <Btn onClick={send} disabled={sending} style={{ boxShadow: 'var(--glow)' }}>
                    <I n={sending ? 'loader' : when === 'later' ? 'calendar' : 'send'} s={14} c="currentColor" />
                    {sending ? 'Working…' : `${when === 'later' ? 'Schedule for' : 'Send to'} ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`}
                  </Btn>
                </div>
              </div>
            </Section>
          </div>

          <div style={{ position: isMobile ? 'static' : 'sticky', top: 0, height: isMobile ? 640 : 'calc(100vh - 150px)', minHeight: 560 }}>
            <InboxPreview html={preview.html} subject={subject} preheader={preheader} fromName={preview.fromName} fromEmail={preview.fromEmail} loading={previewLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Channel choice ─────────────────────────────────────────────────────────

export const ChannelPicker = ({ onPick, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div role="dialog" aria-label="Choose a channel" onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: H, fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Start a campaign</h3>
          <p style={{ fontSize: 13, color: 'var(--t2)', margin: '4px 0 0' }}>How do you want to reach your customers?</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><I n="x" s={18} c="var(--t3)" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {[
          ['whatsapp', 'msg', 'WhatsApp', 'Approved templates sent to phone numbers, with delivery and read receipts.'],
          ['email', 'mail', 'Email', 'A designed email with AI rewriting, sent to email addresses from contacts or a CSV.'],
        ].map(([id, icon, title, desc]) => (
          <button key={id} type="button" onClick={() => onPick(id)}
            style={{ textAlign: 'left', padding: 18, borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--surf)', cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.background = 'var(--gbg)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.background = 'var(--surf)'; }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--gbg)', border: '1px solid var(--gbd)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <I n={icon} s={19} c="var(--green)" />
            </div>
            <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--t1)', margin: '0 0 4px' }}>{title}</p>
            <p style={{ fontSize: 12.5, color: 'var(--t2)', margin: 0, lineHeight: 1.5 }}>{desc}</p>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// ─── List and report ────────────────────────────────────────────────────────

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

const Stat = ({ label: l, value, color }) => (
  <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--surf2)' }}>
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', margin: 0 }}>{l}</p>
    <p style={{ fontFamily: H, fontSize: 22, fontWeight: 700, color: color || 'var(--t1)', margin: '4px 0 0' }}>{value}</p>
  </div>
);

const EmailCampaignReport = ({ id, onClose, onChanged }) => {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('preview');
  const [busy, setBusy] = useState(false);

  const load = () => wFetch(`/email-campaigns/${id}`).then(json).then(setC).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = c && (c.status === 'SENDING' || c.status === 'SCHEDULED');
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (kind) => {
    const ok = await confirmDialog(kind === 'cancel' ? 'Stop this campaign? Emails already sent cannot be recalled.' : 'Delete this campaign and its report?', { title: kind === 'cancel' ? 'Cancel campaign' : 'Delete campaign', confirmLabel: kind === 'cancel' ? 'Stop sending' : 'Delete', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await wFetch(kind === 'cancel' ? `/email-campaigns/${id}/cancel` : `/email-campaigns/${id}`, { method: kind === 'cancel' ? 'POST' : 'DELETE' });
      if (!res.ok) await json(res);
      onChanged?.();
      if (kind === 'delete') onClose(); else load();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const done = c ? c.sent + c.failed + c.skipped : 0;
  const pct = c?.total ? Math.round((done / c.total) * 100) : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: H, fontSize: 17, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{c?.name || 'Email campaign'}</h3>
              {c && <StatusBadge s={c.status} />}
              {c?.aiRewritten && <StatusBadge label="AI designed" tone="violet" />}
            </div>
            {c && <p style={{ fontSize: 12.5, color: 'var(--t2)', margin: '4px 0 0' }}>Subject: <strong style={{ color: 'var(--t1)' }}>{c.subject}</strong></p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><I n="x" s={18} c="var(--t3)" /></button>
        </div>
        {err && <div style={{ padding: 20 }}><Notice tone="err">{err}</Notice></div>}
        {!c && !err && <p style={{ padding: 24, fontSize: 13, color: 'var(--t3)' }}>Loading…</p>}
        {c && (
          <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              <Stat label="Recipients" value={c.total} />
              <Stat label="Sent" value={c.sent} color="var(--green)" />
              <Stat label="Failed" value={c.failed} color={c.failed ? '#dc2626' : undefined} />
              <Stat label="Skipped" value={c.skipped} color={c.skipped ? '#b45309' : undefined} />
            </div>
            {c.status === 'SENDING' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 5 }}><span>Sending…</span><span>{pct}%</span></div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surf3)' }}><div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: 'var(--green)', transition: 'width .4s' }} /></div>
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
              Created {fmt(c.createdAt)}{c.scheduledAt && ` · Scheduled for ${fmt(c.scheduledAt)}`}{c.completedAt && ` · Finished ${fmt(c.completedAt)}`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Pill on={tab === 'preview'} onClick={() => setTab('preview')} icon="eye">Email</Pill>
              <Pill on={tab === 'recipients'} onClick={() => setTab('recipients')} icon="users">Recipients</Pill>
            </div>
            {tab === 'preview' ? (
              <iframe title="Sent email" sandbox="" srcDoc={c.html} style={{ width: '100%', height: 460, border: '1px solid var(--bd)', borderRadius: 10, background: '#f1f5f9' }} />
            ) : (
              <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'auto', maxHeight: 460 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ background: 'var(--surf2)' }}>
                    {['Email', 'Name', 'Status', 'Sent at'].map(h => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {c.recipients.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--bd)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--t1)' }}>{r.email}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{r.name || '—'}</td>
                        <td style={{ padding: '8px 12px' }} title={r.error || ''}>
                          <StatusBadge label={r.status.charAt(0) + r.status.slice(1).toLowerCase()} tone={{ SENT: 'green', FAILED: 'red', SKIPPED: 'amber' }[r.status] || 'gray'} />
                          {r.error && <span style={{ display: 'block', fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>{r.error}</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{r.sentAt ? fmt(r.sentAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {c && can('campaigns.manage') && (
          <div style={{ padding: '12px 22px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {live && <Btn variant="outline" onClick={() => act('cancel')} disabled={busy}>Stop campaign</Btn>}
            {c.status !== 'SENDING' && <Btn variant="ghost" onClick={() => act('delete')} disabled={busy} style={{ color: '#dc2626' }}><I n="trash" s={13} c="#dc2626" /> Delete</Btn>}
          </div>
        )}
      </div>
    </div>
  );
};

export const EmailCampaignsList = ({ search = '', onCreate }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = () => wFetch('/email-campaigns').then(json).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const refresh = useThrottledCallback(load, 2000);
  useRealtime((evt) => { if (evt.type === 'campaign.updated' || evt.type === 'resync') refresh(); });
  const active = rows.some(r => r.status === 'SENDING' || r.status === 'SCHEDULED');
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [active]);

  const q = search.trim().toLowerCase();
  const visible = q ? rows.filter(r => `${r.name} ${r.subject} ${r.status}`.toLowerCase().includes(q)) : rows;

  if (loading) return <div style={{ textAlign: 'center', padding: 48, color: 'var(--t2)', fontSize: 13 }}>Loading email campaigns…</div>;
  if (!visible.length) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '44px 24px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--gbg)', border: '1px solid var(--gbd)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><I n="mail" s={24} c="var(--green)" /></div>
        <p style={{ fontFamily: H, fontSize: 16, fontWeight: 700, color: 'var(--t1)', margin: '0 0 4px' }}>{q ? `No email campaigns match "${search.trim()}"` : 'No email campaigns yet'}</p>
        {!q && <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 16px' }}>Send your first designed email to customers. AI helps you write it.</p>}
        {!q && onCreate && can('campaigns.manage') && <Btn onClick={onCreate} style={{ boxShadow: 'var(--glow)' }}><I n="mail" s={14} c="currentColor" /> New email campaign</Btn>}
      </div>
    );
  }

  return (
    <>
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bd)' }}>
              {['Campaign', 'Status', 'Recipients', 'Sent', 'Failed', 'Skipped', 'Success', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const attempted = r.sent + r.failed;
              const rate = attempted ? Math.round((r.sent / attempted) * 100) : 0;
              return (
                <tr key={r.id} style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--bd)' : 'none' }}>
                  <td style={{ padding: '14px 16px', maxWidth: 280 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.name}{r.aiRewritten && <span title="Designed with AI"><I n="sparkl" s={13} c="#7c3aed" /></span>}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--t3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge s={r.status} /></td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--t2)' }}>{r.total.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--t2)' }}>{r.sent.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: r.failed ? '#dc2626' : 'var(--t2)' }}>{r.failed.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: r.skipped ? '#b45309' : 'var(--t2)' }}>{r.skipped.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px' }}>
                    {attempted ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 4, background: 'rgba(15,23,42,0.06)' }}><div style={{ height: '100%', width: `${rate}%`, borderRadius: 4, background: 'var(--green)' }} /></div>
                        <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{rate}%</span>
                      </div>
                    ) : <span style={{ fontSize: 12, color: 'var(--t3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{fmt(r.completedAt || r.scheduledAt || r.createdAt).split(',').slice(0, 2).join(',')}</td>
                  <td style={{ padding: '14px 16px' }}><Btn variant="outline" size="sm" onClick={() => setOpenId(r.id)}>View</Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openId && <EmailCampaignReport id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
};
