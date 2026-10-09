import { useState, useEffect, useCallback } from 'react';
import { I } from '../components/Icons.jsx';
import { Btn } from '../components/Btn.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { Modal } from '../components/Modal.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { FInput, FLabel, FSelect, FTextarea } from '../components/Form.jsx';
import { ListPager } from '../components/ListPager.jsx';
import { wFetch } from '../lib/api.js';
import { can } from '../lib/permissions.js';
import { PAGE_SIZE, pageParams } from '../lib/paging.js';

// The lead lifecycle. CONVERTED is set by "Convert to deal", never picked by hand.
const STATUSES = [
  { key: 'NEW', label: 'New', tone: 'blue' },
  { key: 'CONTACTED', label: 'Contacted', tone: 'violet' },
  { key: 'QUALIFIED', label: 'Qualified', tone: 'green' },
  { key: 'UNQUALIFIED', label: 'Unqualified', tone: 'gray' },
  { key: 'LOST', label: 'Lost', tone: 'red' },
  { key: 'CONVERTED', label: 'Converted', tone: 'green' },
];
const EDITABLE_STATUSES = STATUSES.filter(s => s.key !== 'CONVERTED');

const DEAL_STAGES = [
  { key: 'QUALIFICATION', label: 'Qualification' },
  { key: 'NEEDS_ANALYSIS', label: 'Needs Analysis' },
  { key: 'PROPOSAL', label: 'Proposal' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
];

const statusOf = key => STATUSES.find(s => s.key === key) || { key, label: key, tone: 'gray' };
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtMoney = v => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const memberOptions = members => members.map(m => ({ value: m.user.id, label: m.user.name || m.user.email }));

const card = { background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 'var(--rl)', boxShadow: 'var(--card-shadow)' };
const th = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' };
const td = { padding: '11px 16px', fontSize: 12.5, color: 'var(--t2)' };
const sectionTitle = { fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--t1)', margin: '20px 0 10px' };

const ErrorBanner = ({ children, onDismiss }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#f87171', fontSize: 12.5 }}>
    <span>{children}</span>
    {onDismiss && (
      <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
        <I n="x" s={14} c="#f87171" />
      </button>
    )}
  </div>
);

async function readError(res, fallback) {
  const d = await res.json().catch(() => ({}));
  return d.error || d.message || fallback;
}

const NewLeadModal = ({ members, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [phoneNumber, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('');
  const [ownerUserId, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!name.trim() || !phoneNumber.trim()) { setErr('Name and phone number are required'); return; }
    setErr(null); setSaving(true);
    try {
      const res = await wFetch('/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phoneNumber: phoneNumber.trim(),
          email: email.trim() || null,
          source: source.trim() || null,
          ownerUserId: ownerUserId || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not create lead'));
      onCreated(await res.json());
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Lead" onClose={onClose} width={500}
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        <Btn size="sm" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Lead'}</Btn>
      </>}>
      {err && <div style={{ marginBottom: 12 }}><ErrorBanner onDismiss={() => setErr(null)}>{err}</ErrorBanner></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><FLabel required>Name</FLabel><FInput value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><FLabel required>Phone</FLabel><FInput value={phoneNumber} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" /></div>
          <div><FLabel>Email</FLabel><FInput type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><FLabel>Source</FLabel><FInput value={source} onChange={e => setSource(e.target.value)} placeholder="WhatsApp, Website…" /></div>
          <div>
            <FLabel>Owner</FLabel>
            <FSelect value={ownerUserId} onChange={e => setOwner(e.target.value)} placeholder="Unassigned" options={memberOptions(members)} />
          </div>
        </div>
        <div><FLabel>Notes</FLabel><FTextarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
    </Modal>
  );
};

const ConvertModal = ({ lead, onClose, onConverted }) => {
  const [title, setTitle] = useState(`${lead.contact?.name || 'New'} — deal`);
  const [value, setValue] = useState('');
  const [stage, setStage] = useState('QUALIFICATION');
  const [closeDate, setCloseDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!title.trim()) { setErr('Deal title is required'); return; }
    setErr(null); setSaving(true);
    try {
      const res = await wFetch(`/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          value: value === '' ? null : Number(value),
          stage,
          expectedCloseDate: closeDate || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not convert lead'));
      onConverted(await res.json());
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="Convert to Deal" onClose={onClose} width={460} zIndex={110}
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
        <Btn size="sm" onClick={submit} disabled={saving}>{saving ? 'Converting…' : 'Create Deal'}</Btn>
      </>}>
      {err && <div style={{ marginBottom: 12 }}><ErrorBanner onDismiss={() => setErr(null)}>{err}</ErrorBanner></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><FLabel required>Deal title</FLabel><FInput value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><FLabel>Value (INR)</FLabel><FInput type="number" value={value} onChange={e => setValue(e.target.value)} /></div>
          <div>
            <FLabel>Stage</FLabel>
            <FSelect value={stage} onChange={e => setStage(e.target.value)} options={DEAL_STAGES.map(s => ({ value: s.key, label: s.label }))} />
          </div>
        </div>
        <div><FLabel>Expected close</FLabel><FInput type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} /></div>
      </div>
    </Modal>
  );
};

const LeadDetailModal = ({ leadId, members, onClose, onChanged, onDeleted }) => {
  const [lead, setLead] = useState(null);
  const [status, setStatus] = useState('NEW');
  const [source, setSource] = useState('');
  const [ownerUserId, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [err, setErr] = useState(null);
  const canEdit = can('crm.records');

  const load = useCallback(() => {
    wFetch(`/leads/${leadId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load lead'))))
      .then(d => {
        setLead(d);
        setStatus(d.status);
        setSource(d.source || '');
        setOwner(d.ownerUserId || '');
        setNotes(d.notes || '');
      })
      .catch(e => setErr(e.message));
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      const body = { source: source.trim() || null, ownerUserId: ownerUserId || null, notes: notes.trim() || null };
      if (status !== lead.status && status !== 'CONVERTED') body.status = status;
      const res = await wFetch(`/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, 'Update failed'));
      onChanged();
      onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this lead? The contact stays in Contacts.')) return;
    setErr(null); setSaving(true);
    try {
      const res = await wFetch(`/leads/${leadId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(await readError(res, 'Delete failed'));
      onDeleted(leadId);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const postNote = async () => {
    if (!newNote.trim()) return;
    const res = await wFetch('/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, type: 'NOTE', content: newNote.trim() }),
    });
    if (res.ok) { setNewNote(''); load(); }
    else setErr(await readError(res, 'Could not add note'));
  };

  const converted = lead?.status === 'CONVERTED';

  return (
    <Modal title={lead ? (lead.contact?.name || 'Lead') : 'Lead'} onClose={onClose} width={580}
      footer={<>
        {canEdit && <Btn variant="outline" size="sm" onClick={remove} disabled={saving || !lead}>Delete</Btn>}
        {canEdit && lead && !converted && (
          <Btn variant="outline" size="sm" onClick={() => setConverting(true)} disabled={saving}>Convert to Deal</Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Btn>
        {canEdit && <Btn size="sm" onClick={save} disabled={saving || !lead}>{saving ? 'Saving…' : 'Save'}</Btn>}
      </>}>
      {err && <div style={{ marginBottom: 12 }}><ErrorBanner onDismiss={() => setErr(null)}>{err}</ErrorBanner></div>}
      {!lead ? (
        <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <Avatar name={lead.contact?.name} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{lead.contact?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {lead.contact?.phoneNumber}{lead.contact?.email ? ` · ${lead.contact.email}` : ''}
              </div>
            </div>
            <span style={{ marginLeft: 'auto' }}><StatusBadge label={statusOf(lead.status).label} tone={statusOf(lead.status).tone} /></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FLabel>Status</FLabel>
                <FSelect value={status} onChange={e => setStatus(e.target.value)} disabled={!canEdit || converted}
                  options={(converted ? STATUSES : EDITABLE_STATUSES).map(s => ({ value: s.key, label: s.label }))} />
              </div>
              <div>
                <FLabel>Owner</FLabel>
                <FSelect value={ownerUserId} onChange={e => setOwner(e.target.value)} disabled={!canEdit}
                  placeholder="Unassigned" options={memberOptions(members)} />
              </div>
            </div>
            <div><FLabel>Source</FLabel><FInput value={source} onChange={e => setSource(e.target.value)} disabled={!canEdit} /></div>
            <div><FLabel>Notes</FLabel><FTextarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit} /></div>
          </div>

          {lead.deals?.length > 0 && (
            <>
              <div style={sectionTitle}>Deals</div>
              {lead.deals.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                  <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{d.title}</span>
                  <span style={{ color: 'var(--t2)' }}>{fmtMoney(d.value)}</span>
                </div>
              ))}
            </>
          )}

          {lead.tasks?.length > 0 && (
            <>
              <div style={sectionTitle}>Tasks</div>
              {lead.tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                  <span style={{ color: t.status === 'COMPLETED' ? 'var(--t3)' : 'var(--t1)', textDecoration: t.status === 'COMPLETED' ? 'line-through' : 'none' }}>{t.title}</span>
                  <span style={{ color: 'var(--t3)' }}>{fmtDate(t.dueDate)}</span>
                </div>
              ))}
            </>
          )}

          <div style={sectionTitle}>Activity</div>
          {canEdit && (
            <div style={{ marginBottom: 12 }}>
              <FTextarea rows={2} placeholder="Add a note…" value={newNote} onChange={e => setNewNote(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Btn size="xs" onClick={postNote} disabled={!newNote.trim()}>Post Note</Btn>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
            {(lead.crmActivities || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No activity yet.</div>}
            {(lead.crmActivities || []).map(a => (
              <div key={a.id} style={{ fontSize: 12.5 }}>
                <div style={{ color: 'var(--t1)', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>{a.content}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>
                  {new Date(a.createdAt).toLocaleString('en-IN')}{a.createdByUser?.name ? ` · ${a.createdByUser.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {converting && lead && (
        <ConvertModal lead={lead} onClose={() => setConverting(false)}
          onConverted={() => { setConverting(false); onChanged(); onClose(); }} />
      )}
    </Modal>
  );
};

export default function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [openLeadId, setOpenLeadId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, status]);

  const load = useCallback(() => {
    setLoading(true);
    const params = { sort: 'newest' };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (status) params.status = status;
    wFetch(`/leads?${pageParams(params, page)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load leads'))))
      .then(d => { setLeads(d.data ?? []); setTotal(d.total ?? 0); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [debouncedSearch, status, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    wFetch('/members').then(r => r.ok && r.json()).then(d => { if (Array.isArray(d)) setMembers(d); })
      .catch((e) => console.warn('[LeadsView] Loading members failed:', e?.message || e));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ height: 58, borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0, background: 'var(--surf)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--t1)' }}>Leads</span>
          <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>{total}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 220 }}>
            <FInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email" />
          </div>
          <div style={{ width: 160 }}>
            <FSelect value={status} onChange={e => setStatus(e.target.value)} placeholder="All statuses"
              options={STATUSES.map(s => ({ value: s.key, label: s.label }))} />
          </div>
          {can('crm.records') && (
            <Btn size="sm" onClick={() => setCreating(true)}><I n="plus" s={14} c="#060A10" /> New Lead</Btn>
          )}
        </div>
      </div>

      {err && <div style={{ padding: '12px 28px 0' }}><ErrorBanner onDismiss={() => setErr(null)}>{err}</ErrorBanner></div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px' }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={th}>Lead</th>
                <th style={th}>Status</th>
                <th style={th}>Source</th>
                <th style={th}>Owner</th>
                <th style={th}>Next task</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => {
                const st = statusOf(l.status);
                const nextTask = l.tasks?.[0];
                return (
                  <tr key={l.id} onClick={() => setOpenLeadId(l.id)} style={{ borderBottom: '1px solid var(--bd)', cursor: 'pointer' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={l.contact?.name} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{l.contact?.name || '—'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{l.contact?.phoneNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td style={td}><StatusBadge label={st.label} tone={st.tone} /></td>
                    <td style={td}>{l.source || '—'}</td>
                    <td style={td}>{l.owner?.name || l.owner?.email || 'Unassigned'}</td>
                    <td style={td}>{nextTask ? `${nextTask.title} · ${fmtDate(nextTask.dueDate)}` : '—'}</td>
                    <td style={td}>{fmtDate(l.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && leads.length === 0 && (
            <div style={{ padding: '38px 20px', textAlign: 'center' }}>
              <I n="target" s={26} c="var(--t3)" />
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--t2)', fontWeight: 600 }}>No leads found</div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>Add a lead, or change the search and filter.</div>
            </div>
          )}
          {loading && leads.length === 0 && (
            <div style={{ padding: 28, fontSize: 12.5, color: 'var(--t3)' }}>Loading leads…</div>
          )}
        </div>
        <ListPager page={page} pageSize={PAGE_SIZE} total={total} loading={loading} onPage={setPage} noun="lead" style={{ marginTop: 12 }} />
      </div>

      {creating && (
        <NewLeadModal members={members} onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }} />
      )}
      {openLeadId && (
        <LeadDetailModal leadId={openLeadId} members={members}
          onClose={() => setOpenLeadId(null)}
          onChanged={load}
          onDeleted={() => { setOpenLeadId(null); load(); }} />
      )}
    </div>
  );
}
