import { useState, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { wFetch } from '../lib/api.js';
import { fmtMoney, fmtMoneyShort } from '../lib/format.js';
import { I } from '../components/Icons.jsx';

const RANGES = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

const STAGE_LABEL = {
  QUALIFICATION: 'Qualification', NEEDS_ANALYSIS: 'Needs Analysis', PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation', CLOSED_WON: 'Closed Won', CLOSED_LOST: 'Closed Lost',
};
const STAGE_ORDER = ['QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION'];

const card = { background: 'var(--surf)', border: '1px solid var(--bd)', borderRadius: 'var(--rl)', boxShadow: 'var(--card-shadow)' };
const cardTitle = { fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--t1)', marginBottom: 14 };
const tooltipStyle = { background:'#ffffff', border: '1px solid var(--bd)', borderRadius: 8, fontSize: 12 };

const nav = (section) => window.dispatchEvent(new CustomEvent('app:nav', { detail: section }));

const Kpi = ({ label, value, hint, icon, tone = 'var(--green)', onClick }) => (
  <button onClick={onClick} disabled={!onClick}
    style={{ ...card, padding: '16px 18px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <I n={icon} s={15} c={tone} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
    {hint && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 6 }}>{hint}</div>}
  </button>
);

export const CrmDashboardView = () => {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    wFetch(`/crm-analytics?range=${range}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load CRM overview'))))
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [range]);

  const k = data?.kpis;
  const act = data?.activityPerformance;
  const byStage = STAGE_ORDER.map(stage => {
    const row = data?.charts?.openPipelineByStage?.find(s => s.stage === stage);
    return { stage: STAGE_LABEL[stage], value: row?.value ?? 0, count: row?.count ?? 0 };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ height: 58, borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0, background: 'var(--surf)' }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--t1)' }}>CRM Overview</span>
        <div style={{ display: 'flex', background: 'rgba(15,23,42,0.03)', borderRadius: 8, padding: 2, border: '1px solid rgba(15,23,42,0.08)' }}>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              style={{ background: range === r.id ? 'rgba(15,23,42,0.1)' : 'transparent', color: range === r.id ? 'var(--t1)' : 'var(--t3)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {err && (
          <div style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#dc2626', fontSize: 12.5 }}>{err}</div>
        )}
        {!data && !err && <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Loading…</div>}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <Kpi label="New leads" icon="target" value={k.newLeads} hint={`${k.qualifiedLeads} qualified · ${k.conversionRate}%`} onClick={() => nav('leads')} />
              <Kpi label="Open deals" icon="briefcase" value={k.openDeals} hint={`${fmtMoney(k.openPipelineTotal)} in pipeline`} onClick={() => nav('deals')} />
              <Kpi label="Won this month" icon="check-circle" value={fmtMoneyShort(k.closedWonMonthly)} hint={`${k.wonDeals} won in 90 days`} />
              <Kpi label="Win rate (90d)" icon="chart" value={`${k.winRate90d}%`} hint={`Avg deal ${fmtMoneyShort(k.averageDeal90d)}`} />
              <Kpi label="Overdue tasks" icon="clock" tone={act.overdueTasks > 0 ? '#dc2626' : 'var(--green)'} value={act.overdueTasks}
                hint={`${act.dueTodayTasks} due today · ${act.completedTasks} done`} onClick={() => nav('tasks')} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
              <div style={{ ...card, padding: 18 }}>
                <div style={cardTitle}>Open pipeline by stage</div>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fill: 'var(--t3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--t3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMoneyShort} width={60} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.count} deals`, 'Value']} cursor={{ fill: 'rgba(15,23,42,0.03)' }} />
                      <Bar dataKey="value" fill="#0d9488" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ ...card, padding: 18 }}>
                <div style={cardTitle}>New pipeline vs won (6 months)</div>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.charts.pipelineVsWon}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: 'var(--t3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--t3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMoneyShort} width={60} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtMoney(v), n === 'newPipeline' ? 'New pipeline' : 'Closed won']} />
                      <Area type="monotone" dataKey="newPipeline" stroke="#0ea5e9" fill="rgba(14,165,233,0.15)" strokeWidth={2} />
                      <Area type="monotone" dataKey="closedWon" stroke="#16a34a" fill="rgba(34,197,94,0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
              <div style={{ ...card, padding: 18 }}>
                <div style={cardTitle}>Top open deals</div>
                {data.dealsInProgress.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>No open deals yet.</div>}
                {data.dealsInProgress.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{d.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{d.company} · {STAGE_LABEL[d.stage] || d.stage} · {d.ageDays}d old</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap' }}>{fmtMoney(d.value)}</span>
                  </div>
                ))}
              </div>

              <div style={{ ...card, padding: 18 }}>
                <div style={cardTitle}>Recent activity</div>
                {data.recentActivity.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Nothing yet.</div>}
                {data.recentActivity.map(a => (
                  <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--t1)' }}>
                      <span style={{ fontWeight: 600 }}>{a.who}</span> · {a.activity}{a.deal !== '-' ? ` on ${a.deal}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>
                      {a.type === 'stage_change' ? a.details.replace(/_/g, ' ') : a.details} · {new Date(a.when).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CrmDashboardView;
