import { useMemo, useState } from 'react';
import { I } from '../components/Icons.jsx';
import MobileNavButton from '../components/MobileNavButton.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { GROUPS, SCOPES, RATE_LIMITS, STATUS_CODES, PUBLIC_BASE, OTP_BASE } from '../data/apiDocs.js';

// The public API reference, under Help. Everything it says comes from
// data/apiDocs.js; this file only lays it out.

const card = { background:'var(--surf)', border:'1px solid var(--bd)', borderRadius:'var(--rl)', boxShadow:'var(--card-shadow)' };
const mono = { fontFamily:'var(--mono)' };
const h2 = { fontFamily:"'Space Grotesk',sans-serif", fontWeight:800, fontSize:20, color:'var(--t1)', letterSpacing:'-.02em', margin:'0 0 8px' };
const h3 = { fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15, color:'var(--t1)', margin:0 };
const label = { fontSize:11, fontWeight:700, color:'var(--t3)', letterSpacing:'.06em', textTransform:'uppercase', margin:'18px 0 8px' };
const para = { fontSize:13.5, color:'var(--t2)', lineHeight:1.65, margin:'0 0 10px' };

const METHOD_COLOURS = {
  GET:    { c:'#0369a1', bg:'rgba(2,132,199,.1)' },
  POST:   { c:'#0f766e', bg:'rgba(13,148,136,.12)' },
  PUT:    { c:'#b45309', bg:'rgba(217,119,6,.12)' },
  PATCH:  { c:'#b45309', bg:'rgba(217,119,6,.12)' },
  DELETE: { c:'#b91c1c', bg:'rgba(220,38,38,.1)' },
};

// `code` spans in the copy, written with backticks in data/apiDocs.js.
const Rich = ({ text }) => String(text || '').split('`').map((part, i) => (i % 2
  ? <code key={i} style={{ ...mono, fontSize:'0.9em', padding:'1px 5px', borderRadius:4, background:'rgba(15,23,42,0.06)', color:'var(--t1)' }}>{part}</code>
  : <span key={i}>{part}</span>));

const Method = ({ m }) => {
  const col = METHOD_COLOURS[m] || METHOD_COLOURS.GET;
  return <span style={{ ...mono, fontSize:11, fontWeight:800, padding:'3px 7px', borderRadius:5, color:col.c, background:col.bg, flexShrink:0 }}>{m}</span>;
};

const CopyBtn = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {}); // can be blocked; the text stays selectable
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Copy" aria-label="Copy" style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:6, background:'var(--surf)', border:'1px solid var(--bd)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <I n={copied ? 'check' : 'copy'} s={12} c={copied ? 'var(--green)' : 'var(--t2)'} />
    </button>
  );
};

const Code = ({ children, title }) => (
  <div style={{ position:'relative', marginBottom:4 }}>
    {title && <div style={{ fontSize:11.5, color:'var(--t3)', marginBottom:6 }}>{title}</div>}
    <pre style={{ ...mono, margin:0, padding:'14px 44px 14px 16px', borderRadius:9, background:'rgba(15,23,42,0.04)', border:'1px solid var(--bd)', overflowX:'auto', fontSize:12, lineHeight:1.65, color:'var(--t1)', whiteSpace:'pre' }}>{children}</pre>
    <CopyBtn text={children} />
  </div>
);

// A [name, type, required, description] table; `cols` picks the headings.
const FieldTable = ({ rows, cols = ['Name', 'Type', 'Required', 'Description'] }) => (
  <div style={{ overflowX:'auto', border:'1px solid var(--bd)', borderRadius:9 }}>
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
      <thead>
        <tr style={{ background:'rgba(15,23,42,0.03)' }}>
          {cols.map(c => <th key={c} style={{ textAlign:'left', padding:'8px 12px', fontSize:11, fontWeight:700, color:'var(--t3)', letterSpacing:'.04em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop:'1px solid var(--bd)', verticalAlign:'top' }}>
            {r.map((cell, j) => {
              if (cols[j] === 'Required') {
                return <td key={j} style={{ padding:'9px 12px', whiteSpace:'nowrap', fontSize:11.5, fontWeight:600, color: cell ? '#b91c1c' : 'var(--t3)' }}>{cell ? 'Required' : 'Optional'}</td>;
              }
              const first = j === 0;
              return (
                <td key={j} style={{ padding:'9px 12px', color: first ? 'var(--t1)' : 'var(--t2)', lineHeight:1.55, ...(first || cols[j] === 'Type' ? { ...mono, fontSize:12, whiteSpace:'nowrap' } : {}) }}>
                  {first || cols[j] === 'Type' ? cell : <Rich text={cell} />}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const json = (v) => JSON.stringify(v, null, 2);

function curlFor(ep, origin, base) {
  const url = `${origin}${base}${ep.path}`;
  const lines = [`curl -X ${ep.method} "${url}"`, `  -H "x-api-key: YOUR_API_KEY"`];
  if (ep.multipart) {
    const fileField = (ep.body || []).find(f => f[1] === 'file')?.[0] || 'file';
    lines.push(`  -F "${fileField}=@/path/to/file"`);
  } else if (ep.example) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${json(ep.example).replace(/'/g, "'\\''")}'`);
  }
  return lines.join(' \\\n');
}

function headerRows(ep) {
  const rows = [['x-api-key', 'string', true, 'Your API key. Sent on every request.']];
  if (ep.multipart) rows.push(['Content-Type', 'string', true, '`multipart/form-data` (set automatically by Postman and curl when you attach a file).']);
  else if (ep.body) rows.push(['Content-Type', 'string', true, '`application/json`']);
  return rows;
}

const Endpoint = ({ ep, base, origin }) => (
  <section id={`ep-${ep.id}`} style={{ ...card, padding:'20px 22px', scrollMarginTop:16 }}>
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:8 }}>
      <h3 style={h3}>{ep.title}</h3>
      {ep.scope
        ? <span style={{ ...mono, marginLeft:'auto', fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid var(--gbd)', color:'var(--green)', background:'var(--gbg)' }}>scope: {ep.scope}</span>
        : <span style={{ marginLeft:'auto', fontSize:11, color:'var(--t3)' }}>No scope needed</span>}
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:8, background:'rgba(15,23,42,0.03)', border:'1px solid var(--bd)', marginBottom:12, overflowX:'auto' }}>
      <Method m={ep.method} />
      <code style={{ ...mono, fontSize:12.5, color:'var(--t1)', whiteSpace:'nowrap' }}>{base}{ep.path}</code>
    </div>
    <p style={para}><Rich text={ep.summary} /></p>

    <p style={label}>Headers</p>
    <FieldTable rows={headerRows(ep)} />

    {ep.params && <>
      <p style={label}>Path parameters</p>
      <FieldTable rows={ep.params} />
    </>}

    {ep.query && <>
      <p style={label}>Query parameters</p>
      <FieldTable rows={ep.query} />
    </>}

    {ep.body
      ? <>
          <p style={label}>Request body {ep.multipart ? '(form-data)' : '(JSON)'}</p>
          <FieldTable rows={ep.body} />
        </>
      : !ep.multipart && ep.method !== 'GET' && <>
          <p style={label}>Request body</p>
          <p style={{ ...para, fontSize:12.5 }}>None. Send the request without a body.</p>
        </>}

    <p style={label}>Example request</p>
    <Code>{curlFor(ep, origin, base)}</Code>

    {ep.response !== undefined && <>
      <p style={label}>Example response</p>
      <Code>{json(ep.response)}</Code>
    </>}

    {ep.notes && <p style={{ ...para, marginTop:12, fontSize:12.5 }}><strong style={{ color:'var(--t1)' }}>Note: </strong><Rich text={ep.notes} /></p>}

    {ep.errors && <>
      <p style={label}>Errors</p>
      <FieldTable rows={ep.errors} cols={['Status', 'When']} />
    </>}
  </section>
);

// "Getting started" chapters, in reading order. Each is plain content; the
// table of contents is built from this list and GROUPS.
function guideSections(origin) {
  return [
    {
      id: 'intro', title: 'Introduction',
      body: <>
        <p style={para}>The Inboxly API lets your own software do what the dashboard does: send WhatsApp messages and templates, run WhatsApp and email campaigns, reply in inbox conversations, manage contacts, segments and opt-outs, and send OTPs. Everything is scoped to the workspace that owns the API key.</p>
        <p style={label}>Base URLs</p>
        <FieldTable cols={['API', 'Base URL']} rows={[
          ['Public API', `${origin}${PUBLIC_BASE}`],
          ['Authentication (OTP) API', `${origin}${OTP_BASE}`],
        ]} />
        <p style={{ ...para, marginTop:10, fontSize:12.5 }}>Each endpoint below shows its full path. Put the base URL in front of it.</p>
      </>,
    },
    {
      id: 'auth', title: 'Authentication',
      body: <>
        <p style={para}>Every request must carry your API key in the <Rich text="`x-api-key`" /> <strong>header</strong>. Do not put it in the URL, query parameters or body; requests without the header are refused with <Rich text="`401`" />.</p>
        <Code>{'x-api-key: cfp_xxxxxxxxxxxxxxxxxxxxxxxx'}</Code>
        <p style={{ ...para, marginTop:12 }}>Create, rotate and revoke keys under <strong>Channels &amp; API → API Keys</strong> (workspace admins only). The full key is shown once, when it is created; store it somewhere safe, like a server environment variable. Never put a key in a website or mobile app where users can read it.</p>
        <p style={label}>In Postman</p>
        <p style={para}>Open the <strong>Headers</strong> tab and add a row with key <Rich text="`x-api-key`" /> and your key as the value. To set it once for a whole collection: collection → <strong>Authorization</strong> → Type <strong>API Key</strong>, Key <Rich text="`x-api-key`" />, Add to <strong>Header</strong>.</p>
        <p style={label}>Check your key</p>
        <Code>{`curl "${origin}${PUBLIC_BASE}/me" \\\n  -H "x-api-key: YOUR_API_KEY"`}</Code>
      </>,
    },
    {
      id: 'requests', title: 'Requests & responses',
      body: <>
        <p style={para}>Request bodies are JSON: send <Rich text="`Content-Type: application/json`" /> (in Postman: Body → raw → JSON). File uploads are the exception and use <Rich text="`multipart/form-data`" /> (Body → form-data, with a field of type File).</p>
        <p style={para}><strong>Path parameters</strong> are part of the URL, shown as <Rich text="`:id`" />. Replace them with the real id, e.g. <Rich text="`/campaigns/cm1abc123`" />. <strong>Query parameters</strong> go after <Rich text="`?`" />, e.g. <Rich text="`/contacts?page=2&limit=50`" /> (in Postman: the Params tab).</p>
        <p style={para}>Responses are JSON, except CSV exports and file downloads. Times are ISO-8601 in UTC, e.g. <Rich text="`2026-10-12T09:30:00.000Z`" />. Phone numbers should include the country code; spaces and dashes are ignored.</p>
      </>,
    },
    {
      id: 'scopes', title: 'Scopes',
      body: <>
        <p style={para}>Each key has a list of scopes that decide what it may do. An endpoint answers <Rich text="`403`" /> with <Rich text="`INSUFFICIENT_SCOPE`" /> when the key lacks its scope. Pick scopes when you generate the key; to change them, generate a new key.</p>
        <FieldTable cols={['Scope', 'Allows', 'Default']} rows={SCOPES.map(([s, d, def]) => [s, d, def ? 'Yes' : '—'])} />
      </>,
    },
    {
      id: 'billing', title: 'Billing',
      body: <>
        <p style={para}>WhatsApp messages sent through the API are billed exactly like messages sent from the dashboard. Each message first uses the plan's monthly quota; after that, the per-message price for the template's category (Marketing, Utility or Authentication) is taken from the wallet. If WhatsApp rejects a send, the charge is refunded.</p>
        <p style={para}>Every message is charged to the wallet. When the balance cannot cover a message, the send is refused with <Rich text="`403`" /> <Rich text="`QUOTA_AND_WALLET_EXHAUSTED`" />. Email campaigns are not billed per message. Use <Rich text="`POST /campaigns/estimate`" /> to see a campaign's cost before launching it.</p>
      </>,
    },
    {
      id: 'limits', title: 'Rate limits',
      body: <>
        <p style={para}>Limits are counted per API key. Going over returns <Rich text="`429`" /> with a <Rich text="`Retry-After`" /> header (seconds to wait) and <Rich text="`retryAfterSeconds`" /> in the body.</p>
        <FieldTable cols={['What', 'Limit']} rows={RATE_LIMITS} />
      </>,
    },
    {
      id: 'errors', title: 'Errors',
      body: <>
        <p style={para}>Errors use standard HTTP status codes and a JSON body:</p>
        <Code>{json({ error: 'Human-readable description', code: 'OPTIONAL_MACHINE_CODE', details: { field: ['Only on 400 validation errors'] } })}</Code>
        <p style={{ ...label }}>Status codes</p>
        <FieldTable cols={['Status', 'Meaning']} rows={STATUS_CODES} />
      </>,
    },
  ];
}

export default function ApiDocsView() {
  const narrow = useMediaQuery('(max-width: 900px)');
  const [query, setQuery] = useState('');
  const origin = typeof window === 'undefined' ? 'https://your-domain.com' : window.location.origin;
  const guide = useMemo(() => guideSections(origin), [origin]);

  // Search narrows the endpoint list by title, path, method, scope or summary.
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return GROUPS;
    return GROUPS
      .map(g => ({ ...g, endpoints: g.endpoints.filter(ep =>
        [ep.title, ep.path, ep.method, ep.scope, ep.summary, g.title].some(v => String(v || '').toLowerCase().includes(q))) }))
      .filter(g => g.endpoints.length);
  }, [q]);

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' });

  const tocLink = (id, text, indent = false, method = null) => (
    <button key={id} onClick={() => jump(id)} style={{ display:'flex', alignItems:'center', gap:6, width:'100%', textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:indent ? '4px 8px 4px 14px' : '5px 8px', borderRadius:6, fontSize:indent ? 12 : 12.5, fontWeight:indent ? 500 : 600, color:indent ? 'var(--t2)' : 'var(--t1)', fontFamily:"'Manrope',sans-serif" }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
      {method && <span style={{ ...mono, fontSize:9.5, fontWeight:800, width:42, flexShrink:0, color:(METHOD_COLOURS[method] || METHOD_COLOURS.GET).c }}>{method}</span>}
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</span>
    </button>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div className="dash-page-head" style={{ height:58, borderBottom:'1px solid var(--bd)', display:'flex', alignItems:'center', padding:'0 28px', flexShrink:0, background:'var(--surf)', gap:10 }}>
        <MobileNavButton />
        <h1 style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:800, fontSize:16, color:'var(--t1)', letterSpacing:'-.02em' }}>API Documentation</h1>
        {!narrow && <p style={{ fontSize:11.5, color:'var(--t2)' }}>Every endpoint, with headers, parameters, bodies and examples</p>}
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {!narrow && (
          <nav aria-label="API documentation contents" style={{ width:250, flexShrink:0, borderRight:'1px solid var(--bd)', overflowY:'auto', padding:'18px 12px', background:'var(--surf)' }}>
            <p style={{ ...label, margin:'0 8px 6px' }}>Getting started</p>
            {guide.map(s => tocLink(`guide-${s.id}`, s.title))}
            <p style={{ ...label, margin:'18px 8px 6px' }}>Endpoints</p>
            {groups.map(g => (
              <div key={g.id} style={{ marginBottom:6 }}>
                {tocLink(`group-${g.id}`, g.title)}
                {g.endpoints.map(ep => tocLink(`ep-${ep.id}`, ep.title, true, ep.method))}
              </div>
            ))}
          </nav>
        )}

        <div className="dash-page" style={{ flex:1, overflowY:'auto', padding:narrow ? '18px 16px' : '26px 32px', boxSizing:'border-box' }}>
          <div style={{ maxWidth:900, margin:'0 auto', display:'flex', flexDirection:'column', gap:18 }}>

            {guide.map(s => (
              <section key={s.id} id={`guide-${s.id}`} style={{ ...card, padding:'22px 24px', scrollMarginTop:16 }}>
                <h2 style={h2}>{s.title}</h2>
                {s.body}
              </section>
            ))}

            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 0' }}>
              <h2 style={{ ...h2, margin:0 }}>Endpoints</h2>
              <div style={{ marginLeft:'auto', position:'relative', width:narrow ? '60%' : 280 }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', display:'flex' }}><I n="search" s={14} c="var(--t3)" /></span>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search endpoints…" aria-label="Search endpoints"
                  style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:8, background:'var(--surf)', border:'1px solid var(--bd)', color:'var(--t1)', fontSize:13, fontFamily:"'Manrope',sans-serif", outline:'none', boxSizing:'border-box' }} />
              </div>
            </div>

            {groups.length === 0 && <p style={{ ...para, textAlign:'center', padding:'30px 0' }}>No endpoint matches “{query}”.</p>}

            {groups.map(g => (
              <div key={g.id} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div id={`group-${g.id}`} style={{ scrollMarginTop:16, paddingTop:8 }}>
                  <h2 style={h2}>{g.title}</h2>
                  <p style={para}><Rich text={g.intro} /></p>
                  {g.base && <p style={{ ...para, fontSize:12.5 }}>Base URL: <Rich text={`\`${origin}${g.base}\``} /></p>}
                </div>
                {g.endpoints.map(ep => <Endpoint key={ep.id} ep={ep} base={g.base || PUBLIC_BASE} origin={origin} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
