'use client';
import { useState, useEffect } from 'react';

const HOUR_LABEL = [
  '08:00–08:50',
  '09:00–09:50',
  '10:30–11:20',
  '11:30–12:20',
  '12:30–13:20',
  '14:30–15:20',
  '15:30–16:20',
  '16:30–17:20',
];

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const PROG = {
  BAI: { bg: '#faf5ff', bd: '#c084fc', tx: '#6b21a8' },
  BCE: { bg: '#eff6ff', bd: '#60a5fa', tx: '#1d4ed8' },
  BCS: { bg: '#ecfeff', bd: '#22d3ee', tx: '#0e7490' },
  BDS: { bg: '#f0fdfa', bd: '#2dd4bf', tx: '#0f766e' },
  BEE: { bg: '#fefce8', bd: '#facc15', tx: '#a16207' },
  BES: { bg: '#fff7ed', bd: '#fb923c', tx: '#c2410c' },
  BME: { bg: '#fff1f2', bd: '#fb7185', tx: '#be123c' },
  CME: { bg: '#f7fee7', bd: '#a3e635', tx: '#4d7c0f' },
  CVE: { bg: '#f0fdf4', bd: '#4ade80', tx: '#166534' },
  CYS: { bg: '#eef2ff', bd: '#818cf8', tx: '#3730a3' },
  EEE: { bg: '#fffbeb', bd: '#fbbf24', tx: '#92400e' },
  EEP: { bg: '#fef2f2', bd: '#f87171', tx: '#991b1b' },
  MGS: { bg: '#fdf2f8', bd: '#f472b6', tx: '#9d174d' },
  MTE: { bg: '#ecfdf5', bd: '#34d399', tx: '#065f46' },
  MTM: { bg: '#f0f9ff', bd: '#38bdf8', tx: '#075985' },
  MTN: { bg: '#f5f3ff', bd: '#a78bfa', tx: '#4c1d95' },
  SWE: { bg: '#fdf4ff', bd: '#e879f9', tx: '#86198f' },
  _:   { bg: '#f8fafc', bd: '#94a3b8', tx: '#334155' },
};

function pal(program) {
  if (!program) return PROG._;
  const k = Object.keys(PROG).find(k => program.startsWith(k));
  return k ? PROG[k] : PROG._;
}

function buildGrid(assignments) {
  const g = Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => []));
  for (const a of assignments)
    for (const s of a.slots || [])
      if (s.day >= 0 && s.day < 5 && s.hour >= 0 && s.hour < 8)
        g[s.day][s.hour].push(a);
  return g;
}

/* ── tiny icon components ── */
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
function IconFilter() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
function Spinner({ size = 14, color = 'white' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid rgba(255,255,255,0.25)`, borderTopColor: color,
      borderRadius: '50%', animation: 'tt-spin 0.65s linear infinite',
      flexShrink: 0,
    }} />
  );
}

/* ── stat card ── */
function StatCard({ label, value, accent, icon }) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px', padding: '18px 20px',
      border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
        background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: '700', color: accent, letterSpacing: '-0.02em', lineHeight: '1' }}>{value}</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      </div>
    </div>
  );
}

/* ── input ── */
function FilterInput({ placeholder, value, onChange, width = 130 }) {
  return (
    <input
      style={{
        background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px',
        borderRadius: '8px', fontSize: '13px', color: '#374151', width,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)', outline: 'none',
      }}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

export default function TimetablePage() {
  const [timetableId, setTimetableId] = useState('');
  const [timetableList, setTimetableList] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filter, setFilter] = useState({ program: '', instructor: '', room: '' });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('grid');

  // Auto-load the list of saved schedules on page open
  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadList() {
    try {
      const r = await fetch('/api/timetable');
      const d = await r.json();
      const list = Array.isArray(d) ? d : [];
      setTimetableList(list);
      // Auto-select and load the most recent schedule if none is loaded yet
      if (list.length > 0 && !timetableId) {
        setTimetableId(list[0]._id);
        await loadTimetable(list[0]._id, filter);
      }
    } catch (e) {
      console.error('loadList error:', e);
    }
  }

  async function loadTimetable(id, f = filter) {
    if (!id) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ id });
      if (f.program)    p.set('program', f.program);
      if (f.instructor) p.set('instructor', f.instructor);
      if (f.room)       p.set('room', f.room);
      const r = await fetch(`/api/timetable?${p}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMeta({ generatedAt: d.generatedAt, hardViolations: d.hardViolations, softScore: d.softScore });
      setAssignments(d.assignments || []);
    } catch (e) {
      console.error('loadTimetable error:', e);
      setMsg('Failed to load timetable: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setMsg('');
    try {
      const r = await fetch('/api/schedule', { method: 'POST' });
      const d = await r.json();
      setMsg(d.message || d.error || JSON.stringify(d));
      if (d.timetableId) {
        setTimetableId(d.timetableId);
        await loadList();
        await loadTimetable(d.timetableId, filter);
      }
    } catch (e) {
      console.error('generate error:', e);
      setMsg('Failed to generate schedule: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  const grid = buildGrid(assignments);
  const scheduled   = assignments.filter(a => a.roomName !== 'UNSCHEDULED').length;
  const unscheduled = assignments.filter(a => a.roomName === 'UNSCHEDULED').length;
  const isSuccess   = msg && (msg.includes('ZERO') || msg.toLowerCase().includes('success'));

  /* ─────────── RENDER ─────────── */
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)' }}>

      {/* ═══ HEADER ═══ */}
      <header style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 24px', height: '62px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
            }}>
              <IconCalendar />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: 'white', letterSpacing: '-0.01em', lineHeight: '1.25' }}>
                GIKI Timetable Scheduler
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.25', marginTop: '1px' }}>
                Spring 2025 · Greedy + Constraint Repair
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {meta && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: meta.hardViolations === 0 ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {meta.hardViolations === 0 ? 'No violations' : `${meta.hardViolations} violation${meta.hardViolations !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}

            <button
              onClick={generate}
              disabled={generating}
              style={{
                background: generating ? 'rgba(59,130,246,0.35)' : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                border: 'none', color: 'white',
                padding: '8px 16px', borderRadius: '8px',
                fontSize: '13px', fontWeight: '600',
                cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '7px',
                boxShadow: generating ? 'none' : '0 1px 3px rgba(59,130,246,0.4)',
                transition: 'opacity 0.15s',
              }}
            >
              {generating ? <Spinner /> : <IconBolt />}
              {generating ? 'Generating…' : 'Generate Schedule'}
            </button>
          </div>
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ── Toolbar ── */}
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
        }}>

          {/* Load saved */}
          <button
            onClick={loadList}
            style={{
              background: 'white', border: '1px solid #e2e8f0', color: '#374151',
              padding: '7px 13px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <IconDownload />
            Load Saved
          </button>

          {timetableList.length > 0 && (
            <select
              value={timetableId}
              onChange={e => { setTimetableId(e.target.value); loadTimetable(e.target.value); }}
              style={{
                background: 'white', border: '1px solid #e2e8f0', color: '#374151',
                padding: '7px 12px', borderRadius: '8px', fontSize: '13px',
                cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                minWidth: '240px', maxWidth: '320px',
              }}
            >
              <option value="">— Select saved schedule —</option>
              {timetableList.map(t => (
                <option key={t._id} value={t._id}>
                  {new Date(t.generatedAt).toLocaleString()} · {t.hardViolations} violations
                </option>
              ))}
            </select>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '28px', background: '#e2e8f0', flexShrink: 0 }} />

          {/* Filter inputs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterInput placeholder="Program (BAI…)" value={filter.program}     onChange={e => setFilter({ ...filter, program: e.target.value })}     width={134} />
            <FilterInput placeholder="Instructor name" value={filter.instructor}  onChange={e => setFilter({ ...filter, instructor: e.target.value })} width={158} />
            <FilterInput placeholder="Room (CS LH1)"  value={filter.room}        onChange={e => setFilter({ ...filter, room: e.target.value })}       width={120} />
            <button
              onClick={() => loadTimetable(timetableId, filter)}
              style={{
                background: '#0f172a', color: 'white', border: 'none',
                padding: '7px 14px', borderRadius: '8px', fontSize: '13px',
                fontWeight: '500', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <IconFilter />Apply
            </button>
            <button
              onClick={() => { const f = { program: '', instructor: '', room: '' }; setFilter(f); loadTimetable(timetableId, f); }}
              style={{
                background: 'white', color: '#64748b',
                border: '1px solid #e2e8f0', padding: '7px 13px',
                borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              }}
            >Clear</button>
          </div>

          {/* View toggle — pushed to the right */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px', padding: '3px', background: '#f1f5f9', borderRadius: '8px' }}>
            {[['grid', 'Grid View'], ['list', 'List View']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '5px 14px', borderRadius: '6px', fontSize: '12px',
                  fontWeight: '500', border: 'none', cursor: 'pointer',
                  transition: 'all 0.12s',
                  background: view === v ? 'white' : 'transparent',
                  color: view === v ? '#0f172a' : '#64748b',
                  boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* ── Status banner ── */}
        {msg && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
            background: isSuccess ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${isSuccess ? '#bbf7d0' : '#fde68a'}`,
            color: isSuccess ? '#166534' : '#92400e',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '15px' }}>{isSuccess ? '✓' : 'ℹ'}</span>
            {msg}
          </div>
        )}

        {/* ── Stats row ── */}
        {meta && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <StatCard label="Sections Scheduled" value={scheduled}   accent="#22c55e" icon="📋" />
            <StatCard label="Unscheduled"         value={unscheduled} accent={unscheduled > 0 ? '#ef4444' : '#94a3b8'} icon="⚠" />
            <StatCard label="Hard Violations"     value={meta.hardViolations} accent={meta.hardViolations === 0 ? '#22c55e' : '#ef4444'} icon="🔒" />
            <StatCard label="Generated At"        value={new Date(meta.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} accent="#3b82f6" icon="🕐" />
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', padding: '80px 20px' }}>
            <div style={{
              display: 'inline-block', width: '32px', height: '32px',
              border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
              borderRadius: '50%', animation: 'tt-spin 0.65s linear infinite',
            }} />
            <p style={{ marginTop: '14px', color: '#94a3b8', fontSize: '14px' }}>Loading timetable…</p>
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {!loading && view === 'grid' && assignments.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '106px', whiteSpace: 'nowrap' }}>
                      Time Slot
                    </th>
                    {DAY_SHORT.map(d => (
                      <th key={d} style={{ padding: '11px 8px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '148px' }}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOUR_LABEL.flatMap((hl, hi) => {
                    const row = (
                      <tr key={hi} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{
                          padding: '8px 16px', fontSize: '11px', fontWeight: '600',
                          color: '#475569', background: '#fafafa', whiteSpace: 'nowrap',
                          verticalAlign: 'top', borderRight: '1px solid #f1f5f9',
                        }}>{hl}</td>
                        {DAY_SHORT.map((_, di) => {
                          const cells = grid[di][hi];
                          return (
                            <td key={di} style={{
                              padding: '5px 6px', verticalAlign: 'top',
                              borderRight: di < 4 ? '1px solid #f1f5f9' : 'none',
                            }}>
                              {cells.map((a, ci) => {
                                const p = pal(a.program);
                                return (
                                  <div key={ci} style={{
                                    background: p.bg,
                                    borderLeft: `3px solid ${p.bd}`,
                                    borderRadius: '6px',
                                    padding: '6px 8px',
                                    marginBottom: '4px',
                                    transition: 'filter 0.12s',
                                  }}>
                                    <div style={{ fontWeight: '700', color: p.tx, fontSize: '11px', lineHeight: '1.35' }}>
                                      {a.courseCode}
                                    </div>
                                    <div style={{ fontSize: '10px', color: p.tx, opacity: 0.75, lineHeight: '1.3' }}>
                                      {a.sectionLabel ? `[${a.sectionLabel}]` : ''} {a.program}
                                    </div>
                                    <div style={{ fontSize: '10px', color: p.tx, opacity: 0.6, lineHeight: '1.3', marginTop: '2px' }}>
                                      {a.instructorName}
                                    </div>
                                    <div style={{ fontSize: '10px', color: p.tx, opacity: 0.5, lineHeight: '1.3', fontVariantNumeric: 'tabular-nums' }}>
                                      {a.roomName}
                                    </div>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    );
                    const breakRow = hi === 4 ? (
                      <tr key="break">
                        <td colSpan={6} style={{
                          padding: '9px 16px',
                          background: 'linear-gradient(90deg, #fffbeb 0%, #fef9c3 50%, #fffbeb 100%)',
                          borderTop: '1px solid #fde68a', borderBottom: '1px solid #fde68a',
                          textAlign: 'center', color: '#92400e',
                          fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          Break · Lunch / Jumu'ah Prayer · 13:20 – 14:30
                        </td>
                      </tr>
                    ) : null;
                    return breakRow ? [row, breakRow] : [row];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {!loading && view === 'list' && assignments.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Course', 'Section', 'Program', 'Instructor', 'Room', 'Schedule', 'CH', 'Lab'].map(h => (
                      <th key={h} style={{
                        padding: '11px 16px', textAlign: 'left',
                        fontWeight: '600', color: '#64748b',
                        fontSize: '11px', textTransform: 'uppercase',
                        letterSpacing: '0.06em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a, i) => {
                    const p = pal(a.program);
                    const uns = a.roomName === 'UNSCHEDULED';
                    return (
                      <tr key={i} style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: uns ? '#fef2f2' : (i % 2 === 0 ? 'white' : '#fafafa'),
                      }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{a.courseCode}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.courseTitle}</div>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#475569', fontSize: '13px' }}>{a.sectionLabel || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '5px',
                            fontSize: '11px', fontWeight: '600',
                            background: p.bg, color: p.tx, border: `1px solid ${p.bd}`,
                          }}>{a.program || '—'}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#475569' }}>{a.instructorName}</td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#475569', fontFamily: 'var(--font-geist-mono, monospace)' }}>{a.roomName}</td>
                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#475569' }}>
                          {a.slots && a.slots.length > 0
                            ? a.slots.map(s => `${DAY_SHORT[s.day]} ${HOUR_LABEL[s.hour]}`).join(', ')
                            : <span style={{ color: '#ef4444', fontWeight: '600', fontSize: '12px' }}>UNSCHEDULED</span>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151' }}>{a.creditHours}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          {a.isLab
                            ? <span style={{ display: 'inline-block', width: '18px', height: '18px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', fontSize: '11px', lineHeight: '18px', textAlign: 'center', fontWeight: '700' }}>✓</span>
                            : <span style={{ color: '#e2e8f0', fontSize: '14px' }}>—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && assignments.length === 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', padding: '88px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{
              width: '60px', height: '60px', background: '#f1f5f9', borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 6px' }}>No timetable loaded</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Click <strong style={{ color: '#374151' }}>Generate Schedule</strong> to run the algorithm, or load a previously saved schedule.
            </p>
          </div>
        )}
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ borderTop: '1px solid #e2e8f0', marginTop: '32px', padding: '16px 24px' }}>
        <p style={{ fontSize: '11px', color: 'black', textAlign: 'center', margin: 0 }}>
          GIKI Timetable Scheduler · Spring 2025 · Greedy + Constraint Repair Algorithm
        </p>
      </footer>
    </div>
  );
}
