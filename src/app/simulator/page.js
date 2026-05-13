'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────
const HOUR_LABEL = [
  '08:30–09:20', '09:30–10:20', '10:30–11:20', '11:30–12:20',
  '12:30–13:20', '14:30–15:20', '15:30–16:20', '16:30–17:20',
];
const DAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const PHASE_META = {
  1: { color: '#3b82f6', bg: '#eff6ff', label: 'Phase 1', name: 'Strict Greedy' },
  2: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Phase 2', name: 'Swap Repair' },
  3: { color: '#f59e0b', bg: '#fffbeb', label: 'Phase 3', name: 'Relax Electives' },
  4: { color: '#f97316', bg: '#fff7ed', label: 'Phase 4', name: 'Relax Groups' },
  5: { color: '#ec4899', bg: '#fdf2f8', label: 'Phase 5', name: 'Soft Lab TBD' },
  6: { color: '#ef4444', bg: '#fef2f2', label: 'Phase 6', name: 'Force Place' },
};

const CONSTRAINT_INFO = {
  H1: { name: 'Room Uniqueness', color: '#ef4444', desc: 'No two sections in the same room at the same time.' },
  H2: { name: 'Instructor Uniqueness', color: '#f97316', desc: 'An instructor cannot teach two sections simultaneously.' },
  H3: { name: 'Program-Year Conflict', color: '#8b5cf6', desc: 'Same program+year students cannot have two classes at once.' },
  H4: { name: 'Room Capacity', color: '#0ea5e9', desc: 'Room capacity must be ≥ section enrollment.' },
  H5: { name: 'Instructor Gap', color: '#22c55e', desc: 'Minimum gap between different sections by the same instructor.' },
};

const PROG_COLORS = {
  BAI: '#a855f7', BCE: '#3b82f6', BCS: '#06b6d4', BDS: '#14b8a6',
  BEE: '#eab308', BES: '#f97316', BME: '#f43f5e', CME: '#84cc16',
  CVE: '#22c55e', CYS: '#6366f1', EEE: '#f59e0b', EEP: '#ef4444',
  MGS: '#ec4899', MTE: '#10b981', MTM: '#38bdf8', MTN: '#7c3aed',
  SWE: '#d946ef',
};

function progColor(program) {
  if (!program) return '#94a3b8';
  const k = Object.keys(PROG_COLORS).find(k => program.startsWith(k));
  return k ? PROG_COLORS[k] : '#94a3b8';
}

// ── Mini timetable grid ────────────────────────────────────────────────────
function MiniGrid({ assignments, highlight }) {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => []));
  for (const a of assignments) {
    for (const s of (a.slots || [])) {
      if (s.day >= 0 && s.day < 5 && s.hour >= 0 && s.hour < 8) {
        grid[s.day][s.hour].push(a);
      }
    }
  }
  const isHighlighted = (a) => highlight && (
    a.courseCode === highlight.courseCode && a.sectionLabel === highlight.sectionLabel
  );

  return (
    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', minWidth: '80px' }}>Slot</th>
            {DAY_NAME.map(d => (
              <th key={d} style={{ padding: '6px 4px', color: '#64748b', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', minWidth: '100px' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOUR_LABEL.map((hl, hi) => (
            <tr key={hi} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 8px', color: '#475569', fontWeight: 600, fontSize: '9px', background: '#fafafa', whiteSpace: 'nowrap' }}>
                {hl}
                {hi === 4 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>↓ Break</div>}
              </td>
              {DAY_NAME.map((_, di) => (
                <td key={di} style={{ padding: '3px', verticalAlign: 'top', minHeight: '32px' }}>
                  {grid[di][hi].map((a, ai) => {
                    const col = progColor(a.program);
                    const isHL = isHighlighted(a);
                    return (
                      <div key={ai} 
                        title={`Placed here because:\n1. Room ${a.roomName} (cap ${a.roomCapacity}) fits ${a.enrollment} students.\n2. Instructor ${a.instructorName} is free & has minimum gap.\n3. Days/Slots were selected based on constraint sorting (load-balancing & preferred MWF/TTh).`}
                        style={{
                        padding: '2px 4px', borderRadius: '4px', marginBottom: '2px',
                        background: isHL ? col : col + '18',
                        border: `1px solid ${isHL ? col : col + '40'}`,
                        color: isHL ? 'white' : col,
                        fontWeight: isHL ? 700 : 500,
                        fontSize: '9px', lineHeight: '1.3',
                        boxShadow: isHL ? `0 0 0 2px ${col}` : 'none',
                        transition: 'all 0.2s',
                      }}>
                        <div style={{ fontWeight: 700 }}>{a.courseCode}</div>
                        <div style={{ opacity: 0.85 }}>{a.sectionLabel} · {a.roomName}</div>
                      </div>
                    );
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: '8px', fontSize: '11px', color: '#64748b', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <strong>Why are sections placed in specific inner slots?</strong>
        <span>1. <strong>Day-Load Balancing:</strong> The algorithm counts how many classes are on each day and actively prefers days with fewer classes. E.g., it might shift to Tue/Thu if Mon/Wed/Fri is heavily loaded.</span>
        <span>2. <strong>Slot Availability:</strong> It checks slots from 08:30 downwards. If 08:30 is full (room taken or instructor busy), it naturally slides to 09:30, 10:30, etc.</span>
        <span>3. <strong>Tie-Breakers:</strong> For equal loads, 3-CH courses explicitly prefer Mon-Wed-Fri over consecutive days to give students a break.</span>
      </div>
    </div>
  );
}

// ── Constraint badge ───────────────────────────────────────────────────────
function ConstraintBadge({ id, violated }) {
  const info = CONSTRAINT_INFO[id];
  if (!info) return null;
  return (
    <div title={info.desc} style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
      background: violated ? info.color + '18' : '#f0fdf4',
      border: `1px solid ${violated ? info.color + '60' : '#86efac'}`,
      color: violated ? info.color : '#16a34a',
    }}>
      <span style={{ fontSize: '10px' }}>{violated ? '✗' : '✓'}</span>
      {id}
    </div>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────
function StepCard({ step, isActive, onClick }) {
  const phase = step.phase || 0;
  const pm = PHASE_META[phase] || { color: '#64748b', bg: '#f8fafc', label: '', name: '' };

  const typeConfig = {
    INIT:         { icon: '🚀', bg: '#f8fafc', border: '#e2e8f0', titleColor: '#0f172a' },
    PHASE_START:  { icon: '▶', bg: pm.bg, border: pm.color + '40', titleColor: pm.color },
    PHASE_END:    { icon: '✔', bg: '#f0fdf4', border: '#86efac', titleColor: '#16a34a' },
    PLACE_SUCCESS:{ icon: '✓', bg: '#f0fdf4', border: '#86efac', titleColor: '#16a34a' },
    PLACE_FAIL:   { icon: '✗', bg: '#fef2f2', border: '#fca5a5', titleColor: '#dc2626' },
    SWAP_DIRECT:  { icon: '↗', bg: '#f0fdf4', border: '#86efac', titleColor: '#16a34a' },
    SWAP_SUCCESS: { icon: '⇄', bg: '#f0fdf4', border: '#86efac', titleColor: '#16a34a' },
    SWAP_UNDO:    { icon: '↩', bg: '#fffbeb', border: '#fde68a', titleColor: '#d97706' },
    SWAP_FAIL:    { icon: '✗', bg: '#fef2f2', border: '#fca5a5', titleColor: '#dc2626' },
    RELAX_PLACE:  { icon: '~', bg: '#fffbeb', border: '#fde68a', titleColor: '#d97706' },
    FINAL:        { icon: '🏁', bg: '#f0f9ff', border: '#7dd3fc', titleColor: '#0369a1' },
  };

  const cfg = typeConfig[step.type] || typeConfig.INIT;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
        background: isActive ? cfg.bg : 'white',
        border: `1px solid ${isActive ? cfg.border : '#f1f5f9'}`,
        boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        transition: 'all 0.15s',
        borderLeft: `3px solid ${isActive ? cfg.border : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{cfg.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: isActive ? cfg.titleColor : '#374151', lineHeight: '1.3' }}>
            {step.title}
          </div>
          {phase > 0 && (
            <div style={{ fontSize: '10px', color: pm.color, fontWeight: 500, marginTop: '2px' }}>
              {pm.label}: {pm.name}
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>Step {step.id + 1}</div>
        </div>
      </div>
    </div>
  );
}

// ── Detail panel for each step type ───────────────────────────────────────
function StepDetail({ step, assignments }) {
  if (!step) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Scheduling Algorithm Simulator</div>
      <div style={{ fontSize: '13px' }}>Click a step on the left to explore what happens at each stage.</div>
    </div>
  );

  const phase = step.phase || 0;
  const pm = PHASE_META[phase];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderRadius: '10px',
        background: pm ? pm.bg : '#f8fafc',
        border: `1px solid ${pm ? pm.color + '30' : '#e2e8f0'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          {pm && (
            <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: pm.color, color: 'white' }}>
              {pm.label}: {pm.name}
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Step {step.id + 1} · {step.type}</span>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{step.title}</div>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>{step.description}</div>
      </div>

      {/* INIT step: show all data */}
      {step.type === 'INIT' && (
        <>
          <ConstraintsPanel />
          <SortedSectionsPanel sections={step.sortedSections} total={step.totalSections} />
          <RoomsPanel rooms={step.rooms} />
        </>
      )}

      {/* PHASE_START */}
      {step.type === 'PHASE_START' && pm && (
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Phase Strategy</div>
          <PhaseStrategyPanel phase={phase} />
        </div>
      )}

      {/* PLACE_SUCCESS / PLACE_FAIL */}
      {(step.type === 'PLACE_SUCCESS' || step.type === 'PLACE_FAIL') && step.section && (
        <PlacementPanel step={step} />
      )}

      {/* SWAP steps */}
      {(step.type === 'SWAP_SUCCESS' || step.type === 'SWAP_UNDO' || step.type === 'SWAP_FAIL' || step.type === 'SWAP_DIRECT') && (
        <SwapPanel step={step} />
      )}

      {/* RELAX_PLACE */}
      {step.type === 'RELAX_PLACE' && step.section && (
        <RelaxPanel step={step} />
      )}

      {/* PHASE_END */}
      {step.type === 'PHASE_END' && (
        <PhaseEndPanel step={step} />
      )}

      {/* FINAL */}
      {step.type === 'FINAL' && (
        <FinalPanel step={step} />
      )}

      {/* Grid snapshot */}
      {assignments && assignments.length > 0 && step.type !== 'INIT' && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
            Current Timetable State ({assignments.length} sections placed)
          </div>
          <MiniGrid
            assignments={assignments}
            highlight={step.section || step.assignment}
          />
        </div>
      )}
    </div>
  );
}

function ConstraintsPanel() {
  return (
    <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Hard Constraints</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(CONSTRAINT_INFO).map(([id, info]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: info.color + '08', border: `1px solid ${info.color}20` }}>
            <span style={{ padding: '2px 7px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: info.color, color: 'white', flexShrink: 0 }}>{id}</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{info.name}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{info.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortedSectionsPanel({ sections, total }) {
  const [show, setShow] = useState(false);
  const visible = show ? sections : sections?.slice(0, 8);
  return (
    <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
          Sections Sorted by Constraint Density ({total} total)
        </div>
        <button onClick={() => setShow(!show)} style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {show ? 'Show Less' : `Show All ${sections?.length}`}
        </button>
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
        Sort order: Enrollment ↓ → Named instructor → Non-elective → Credit hours ↓ → Program count ↓
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {visible?.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: '#f8fafc', fontSize: '11px' }}>
            <span style={{ width: '22px', textAlign: 'right', color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>#{i+1}</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: progColor(s.program), flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: '#374151', minWidth: '80px' }}>{s.courseCode}</span>
            <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.courseTitle}</span>
            {s.sectionLabel && <span style={{ color: '#3b82f6', fontWeight: 600 }}>§{s.sectionLabel}</span>}
            <span style={{ color: '#94a3b8' }}>{s.program || 'Elective'}</span>
            <span style={{ color: '#475569', fontWeight: 600 }}>{s.creditHours}CH</span>
            <span style={{ color: '#f97316', fontWeight: 600 }}>{s.enrollment}👥</span>
            {s.isLab && <span style={{ padding: '1px 5px', borderRadius: '3px', background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>LAB</span>}
            {s.isElective && <span style={{ padding: '1px 5px', borderRadius: '3px', background: '#f0fdf4', color: '#16a34a', fontWeight: 600 }}>ELEC</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomsPanel({ rooms }) {
  const [show, setShow] = useState(false);
  const visible = show ? rooms : rooms?.slice(0, 8);
  return (
    <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Available Rooms ({rooms?.length})</div>
        <button onClick={() => setShow(!show)} style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {show ? 'Show Less' : 'Show All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px' }}>
        {visible?.map((r, i) => (
          <div key={i} style={{ padding: '7px 10px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '11px' }}>
            <div style={{ fontWeight: 700, color: '#374151' }}>{r.name}</div>
            <div style={{ color: '#6b7280', marginTop: '2px' }}>Cap: {r.capacity} · {r.isLab ? 'Lab' : 'Lecture'}</div>
            {r.allocation && <div style={{ color: '#3b82f6', fontSize: '10px' }}>{r.allocation}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseStrategyPanel({ phase }) {
  const strategies = {
    1: [
      { title: 'Sort by Constraint Density', desc: 'Most-constrained sections are scheduled first to claim best resources.' },
      { title: 'Day-Load Balancing', desc: 'Track classes per day; prefer days with fewer classes to spread load evenly.' },
      { title: 'Room Priority', desc: 'Prefer rooms allocated for the section\'s program, then smallest fitting room.' },
      { title: 'Slot Combinations', desc: '3-CH: 3 non-consecutive days · 2-CH: 2 days · Lab: 3 consecutive hours · 1-CH: any slot.' },
      { title: 'All Constraints Active', desc: 'H1 + H2 + H3 + H4 + H5 all enforced strictly.' },
    ],
    2: [
      { title: 'Find Conflicting Section', desc: 'For each unplaced section U, find a placed section V that shares instructor or program/year.' },
      { title: 'Tentative Removal', desc: 'Temporarily remove V from the schedule and free its room/slot.' },
      { title: 'Place U', desc: 'Try placing U in the now-available spots.' },
      { title: 'Re-place V', desc: 'Find a new slot for V. If successful, both are placed.' },
      { title: 'Backtrack on Failure', desc: 'If V cannot be re-placed, undo the swap and try the next candidate victim.' },
    ],
    3: [
      { title: 'Elective Overlap Allowed', desc: 'H3 is skipped for elective courses — students self-select electives so overlap is acceptable.' },
      { title: 'All other constraints active', desc: 'H1, H2, H4, H5 remain strictly enforced.' },
    ],
    4: [
      { title: 'Section Group Overlap Allowed', desc: 'H3 skipped between different section groups (A vs B) of the same program/year.' },
      { title: 'Rationale', desc: 'Students in group A don\'t attend group B\'s classes, so their slots don\'t conflict.' },
    ],
    5: [
      { title: 'Instructor Conflict → TBD', desc: 'H2 is skipped; instructor conflicts are flagged as TBD for manual resolution.' },
      { title: 'Gap enforcement disabled', desc: 'H5 gap requirement is also relaxed.' },
      { title: 'Used for labs', desc: 'Lab sections that couldn\'t be placed normally are handled here.' },
    ],
    6: [
      { title: 'Force Placement', desc: 'Both H2 and H3 are fully skipped. Every remaining section is assigned a slot regardless of conflicts.' },
      { title: 'FORCE marker', desc: 'Assignments are tagged FORCE and counted as hard violations.' },
      { title: 'Last resort', desc: 'Ensures every section appears in the timetable, even imperfectly.' },
    ],
  };
  const items = strategies[phase] || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: (PHASE_META[phase]?.bg || '#f8fafc') }}>
          <span style={{ fontWeight: 700, color: PHASE_META[phase]?.color || '#374151', flexShrink: 0, minWidth: '16px' }}>{i+1}.</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#374151' }}>{item.title}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacementPanel({ step }) {
  const sec = step.section;
  const asgn = step.assignment;
  const isSuccess = step.type === 'PLACE_SUCCESS';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Section info */}
      <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Section Being Scheduled</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: progColor(sec.program) }}>{sec.courseCode}</span>
          {sec.sectionLabel && <span style={{ fontSize: '13px', color: '#475569' }}>§{sec.sectionLabel}</span>}
          <span style={{ padding: '2px 8px', borderRadius: '99px', background: progColor(sec.program) + '18', color: progColor(sec.program), fontWeight: 600, fontSize: '11px' }}>{sec.program || 'Elective'}</span>
          {sec.isLab && <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#fef3c7', color: '#d97706', fontWeight: 600, fontSize: '11px' }}>LAB</span>}
          {sec.isElective && <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f0fdf4', color: '#16a34a', fontWeight: 600, fontSize: '11px' }}>ELECTIVE</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px', marginTop: '10px' }}>
          {[
            ['Instructor', sec.instructorName || 'TBA'],
            ['Credit Hours', sec.creditHours + ' CH'],
            ['Enrollment', sec.enrollment + ' students'],
            ['Year Level', 'Year ' + (sec.yearLevel || '?')],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '6px 8px', borderRadius: '5px', background: '#f8fafc', fontSize: '11px' }}>
              <div style={{ color: '#9ca3af' }}>{k}</div>
              <div style={{ fontWeight: 600, color: '#374151', marginTop: '2px' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Constraints checked */}
      {step.constraintsChecked && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Constraints Checked</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {step.constraintsChecked.map(id => <ConstraintBadge key={id} id={id} violated={false} />)}
          </div>
        </div>
      )}

      {/* Result */}
      {isSuccess && asgn ? (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', marginBottom: '8px' }}>✓ Placed Successfully</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              ['Room', asgn.roomName],
              ['Capacity', asgn.roomCapacity + ' seats'],
              ['Time Slots', asgn.slotLabel],
              ['Combos Tried', step.combosChecked],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '6px 8px', borderRadius: '5px', background: 'white', border: '1px solid #dcfce7', fontSize: '11px' }}>
                <div style={{ color: '#9ca3af' }}>{k}</div>
                <div style={{ fontWeight: 600, color: '#374151', marginTop: '2px' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fca5a5' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626', marginBottom: '8px' }}>✗ Could Not Place</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Checked {step.combosChecked} slot combinations — all failed due to constraint violations. Queued for repair phases.</div>
          {step.rejectedReasons?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Last rejection reasons:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {step.rejectedReasons.map((r, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#6b7280', padding: '4px 6px', borderRadius: '4px', background: 'white', border: '1px solid #fee2e2' }}>
                    <span style={{ fontWeight: 600, color: '#ef4444' }}>{r.reason}</span>
                    {r.room && <span> · Room: {r.room}</span>}
                    {r.combo && <span> · {r.combo.map(s => DAY_NAME[s.day] + ' ' + HOUR_LABEL[s.hour]).join(', ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwapPanel({ step }) {
  const isSuccess = step.type === 'SWAP_SUCCESS' || step.type === 'SWAP_DIRECT';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Target Section (to be placed)</div>
        {step.section && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: progColor(step.section.program) }}>{step.section.courseCode}</span>
            <span style={{ color: '#475569' }}>{step.section.sectionLabel}</span>
            <span style={{ padding: '2px 8px', borderRadius: '99px', background: progColor(step.section.program) + '18', color: progColor(step.section.program), fontSize: '11px', fontWeight: 600 }}>{step.section.program}</span>
          </div>
        )}
      </div>
      {step.victim && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '8px' }}>Displaced Section (victim)</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>{step.victim.courseCode}</span>
            <span>{step.victim.sectionLabel}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
            Old: {step.victim.oldRoom} · {step.victim.oldSlot}
          </div>
          {step.victim.newRoom && (
            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px', fontWeight: 600 }}>
              Re-placed: {step.victim.newRoom} · {step.victim.newSlot}
            </div>
          )}
        </div>
      )}
      {step.assignment && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: isSuccess ? '#f0fdf4' : '#fef2f2', border: `1px solid ${isSuccess ? '#86efac' : '#fca5a5'}` }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: isSuccess ? '#16a34a' : '#dc2626', marginBottom: '6px' }}>
            {isSuccess ? '✓ Target Placed' : '✗ Failed'}
          </div>
          {step.assignment && <div style={{ fontSize: '12px', color: '#374151' }}>{step.assignment.roomName} · {step.assignment.slotLabel}</div>}
        </div>
      )}
      {step.swapAttempts !== undefined && (
        <div style={{ fontSize: '11px', color: '#6b7280', padding: '6px 10px', borderRadius: '6px', background: '#f8fafc' }}>
          Swap attempts tried: {step.swapAttempts}
        </div>
      )}
    </div>
  );
}

function RelaxPanel({ step }) {
  const pm = PHASE_META[step.phase];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {step.section && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Section</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: progColor(step.section.program) }}>{step.section.courseCode}</span>
            <span>{step.section.sectionLabel}</span>
            <span style={{ padding: '2px 8px', borderRadius: '99px', background: '#f8fafc', color: '#6b7280', fontSize: '11px' }}>{step.section.program || 'Elective'}</span>
          </div>
        </div>
      )}
      {step.relaxed && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: pm?.bg || '#fffbeb', border: `1px solid ${pm?.color || '#fde68a'}40` }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: pm?.color || '#d97706', marginBottom: '6px' }}>Relaxed Constraints</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {step.relaxed.map((r, i) => (
              <span key={i} style={{ padding: '3px 8px', borderRadius: '99px', background: 'white', border: `1px solid ${pm?.color || '#fde68a'}`, color: pm?.color || '#d97706', fontSize: '11px', fontWeight: 600 }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
      {step.assignment && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', marginBottom: '6px' }}>Placed</div>
          <div style={{ fontSize: '12px', color: '#374151' }}>{step.assignment.roomName} · {step.assignment.slotLabel}</div>
          {step.assignment.instructorName && step.assignment.instructorName.includes('TBD') && (
            <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>⚠ Instructor conflict — marked TBD</div>
          )}
          {step.assignment.instructorName && step.assignment.instructorName.includes('FORCE') && (
            <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>⛔ Force placed — may have H2/H3 violations</div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseEndPanel({ step }) {
  const pm = PHASE_META[step.phase];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{step.placed}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>Total Placed</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: step.unassigned > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${step.unassigned > 0 ? '#fca5a5' : '#86efac'}`, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: step.unassigned > 0 ? '#dc2626' : '#16a34a' }}>{step.unassigned}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>Still Unassigned</div>
        </div>
      </div>
      {step.snapshot && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>Recent Assignments (sample)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {step.snapshot.slice(0, 10).map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', padding: '5px 7px', borderRadius: '5px', background: '#f8fafc', fontSize: '11px', alignItems: 'center' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: progColor(a.program), flexShrink: 0 }} />
                <span style={{ fontWeight: 700, color: '#374151', minWidth: '70px' }}>{a.courseCode}</span>
                <span style={{ color: '#6b7280', flex: 1 }}>{a.slotLabel}</span>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>{a.roomName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FinalPanel({ step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Total Sections', value: step.totalSections, color: '#3b82f6' },
          { label: 'Scheduled', value: step.scheduled, color: '#22c55e' },
          { label: 'Unscheduled', value: step.unscheduled, color: step.unscheduled > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Hard Violations', value: step.hardViolations, color: step.hardViolations === 0 ? '#22c55e' : '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: '14px 16px', borderRadius: '8px', background: 'white', border: `1px solid ${color}30`, textAlign: 'center' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderRadius: '8px', background: step.hardViolations === 0 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${step.hardViolations === 0 ? '#86efac' : '#fde68a'}` }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: step.hardViolations === 0 ? '#16a34a' : '#d97706' }}>
          {step.hardViolations === 0
            ? '✓ Perfect schedule — zero hard constraint violations!'
            : `⚠ ${step.hardViolations} hard constraint violation(s) remain. Check FORCE/TBD assignments.`}
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / (total - 1)) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '99px', transition: 'width 0.2s' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

// ── Phase filter tabs ──────────────────────────────────────────────────────
function PhaseTabs({ activePhase, onChange }) {
  const phases = [
    { id: null, label: 'All' },
    ...Object.entries(PHASE_META).map(([k, v]) => ({ id: Number(k), label: v.label })),
  ];
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {phases.map(p => (
        <button key={p.id ?? 'all'} onClick={() => onChange(p.id)} style={{
          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none',
          background: activePhase === p.id ? (PHASE_META[p.id]?.color || '#374151') : '#f1f5f9',
          color: activePhase === p.id ? 'white' : '#6b7280',
          transition: 'all 0.15s',
        }}>{p.label}</button>
      ))}
    </div>
  );
}

// ── Main simulator component ───────────────────────────────────────────────
export default function SimulatorPage() {
  const [steps, setSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [finalAssignments, setFinalAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1200);
  const [phaseFilter, setPhaseFilter] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const stepListRef = useRef(null);
  const autoTimer = useRef(null);

  // Build incremental assignment snapshots for each step
  const [assignmentSnapshots, setAssignmentSnapshots] = useState([]);

  useEffect(() => {
    if (steps.length === 0) return;
    // Build snapshot at each step: accumulate assignments progressively
    const snapshots = [];
    const acc = [];
    for (const step of steps) {
      if (step.type === 'PLACE_SUCCESS' || step.type === 'SWAP_DIRECT' || step.type === 'SWAP_SUCCESS' || step.type === 'RELAX_PLACE') {
        if (step.section && step.assignment) {
          acc.push({
            courseCode: step.section.courseCode,
            sectionLabel: step.section.sectionLabel,
            program: step.section.program,
            slots: (step.assignment.slots || []),
            roomName: step.assignment.roomName,
            instructorName: step.section.instructorName,
            roomCapacity: step.assignment.roomCapacity,
            enrollment: step.section.enrollment,
          });
        }
      }
      snapshots.push([...acc]);
    }
    setAssignmentSnapshots(snapshots);
  }, [steps]);

  async function runSimulation() {
    setLoading(true);
    setError('');
    setSteps([]);
    setCurrentStep(0);
    setFinalAssignments([]);
    try {
      const res = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceLimit: 999999 }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSteps(data.steps || []);
      setFinalAssignments(data.finalAssignments || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-play
  useEffect(() => {
    if (!autoPlay) { clearTimeout(autoTimer.current); return; }
    autoTimer.current = setTimeout(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= filteredSteps.length) { setAutoPlay(false); return prev; }
        return next;
      });
    }, autoSpeed);
    return () => clearTimeout(autoTimer.current);
  });

  // Filtered steps
  const filteredSteps = steps.filter(s => {
    if (phaseFilter !== null && s.phase !== phaseFilter && s.type !== 'INIT' && s.type !== 'FINAL') return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!JSON.stringify(s).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeStep = filteredSteps[currentStep];
  const activeStepIndex = activeStep ? activeStep.id : 0;

  // Scroll active step into view
  useEffect(() => {
    if (!stepListRef.current) return;
    const el = stepListRef.current.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  function go(dir) {
    setCurrentStep(prev => Math.max(0, Math.min(filteredSteps.length - 1, prev + dir)));
  }

  // Phase breakdown counts
  const phaseCounts = {};
  for (const s of steps) {
    if (s.phase && s.type !== 'PHASE_START' && s.type !== 'PHASE_END') {
      phaseCounts[s.phase] = (phaseCounts[s.phase] || 0) + 1;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)' }}>
      {/* ─── Header ─── */}
      <header style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: '1700px', margin: '0 auto', padding: '0 24px', height: '62px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              🔬
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'white', letterSpacing: '-0.01em' }}>Algorithm Simulator</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Step-by-step timetable scheduling visualization</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a href="/" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#94a3b8', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
              ← Timetable
            </a>
            <button
              onClick={runSimulation}
              disabled={loading}
              style={{
                background: loading ? 'rgba(37,99,235,0.35)' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                border: 'none', color: 'white', padding: '8px 18px', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '7px',
                boxShadow: loading ? 'none' : '0 1px 3px rgba(37,99,235,0.4)',
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', borderRadius: '50%', animation: 'tt-spin 0.65s linear infinite' }} />
                  Running…
                </>
              ) : '▶ Run Simulation'}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Error ─── */}
      {error && (
        <div style={{ maxWidth: '1700px', margin: '16px auto', padding: '0 24px' }}>
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '13px' }}>⚠ {error}</div>
        </div>
      )}

      {/* ─── Welcome screen ─── */}
      {!loading && steps.length === 0 && !error && (
        <div style={{ maxWidth: '900px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔬</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Scheduling Algorithm Simulator</div>
          <div style={{ fontSize: '15px', color: '#64748b', lineHeight: '1.7', marginBottom: '32px', maxWidth: '600px', margin: '0 auto 32px' }}>
            Watch the 6-phase algorithm work step-by-step. See how sections are sorted, how constraints are checked, how swaps resolve conflicts, and how progressive relaxation handles edge cases.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '32px', maxWidth: '800px', margin: '0 auto 32px' }}>
            {Object.entries(PHASE_META).map(([k, v]) => (
              <div key={k} style={{ padding: '16px', borderRadius: '10px', background: 'white', border: `1px solid ${v.color}30`, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '99px', background: v.color, color: 'white', fontSize: '11px', fontWeight: 700 }}>{v.label}</span>
                  <span style={{ fontWeight: 600, fontSize: '12px', color: '#374151' }}>{v.name}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {k === '1' && 'Greedy construction: most-constrained first.'}
                  {k === '2' && 'Backtracking swaps to fix conflicts.'}
                  {k === '3' && 'Relax H3 for elective courses.'}
                  {k === '4' && 'Relax H3 between section groups.'}
                  {k === '5' && 'Skip H2, mark instructor TBD.'}
                  {k === '6' && 'Force place, skip H2+H3.'}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={runSimulation}
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              border: 'none', color: 'white', padding: '14px 32px', borderRadius: '10px',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            }}
          >
            ▶ Start Simulation
          </button>
        </div>
      )}

      {/* ─── Loading ─── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'tt-spin 0.65s linear infinite' }} />
          <p style={{ marginTop: '16px', color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Running scheduler and tracing all steps…</p>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>This may take a few seconds for large datasets</p>
        </div>
      )}

      {/* ─── Main simulator UI ─── */}
      {!loading && steps.length > 0 && (
        <div style={{ maxWidth: '1700px', margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* ─── Control bar ─── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Nav buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setCurrentStep(0)} disabled={currentStep === 0} title="First" style={navBtnStyle(currentStep === 0)}>⏮</button>
                <button onClick={() => go(-1)} disabled={currentStep === 0} title="Previous" style={navBtnStyle(currentStep === 0)}>◀</button>
                <button
                  onClick={() => setAutoPlay(!autoPlay)}
                  style={{
                    padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                    background: autoPlay ? '#ef4444' : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                    color: 'white', minWidth: '80px',
                  }}
                >{autoPlay ? '⏸ Pause' : '▶ Auto'}</button>
                <button onClick={() => go(1)} disabled={currentStep >= filteredSteps.length - 1} title="Next" style={navBtnStyle(currentStep >= filteredSteps.length - 1)}>▶</button>
                <button onClick={() => setCurrentStep(filteredSteps.length - 1)} disabled={currentStep >= filteredSteps.length - 1} title="Last" style={navBtnStyle(currentStep >= filteredSteps.length - 1)}>⏭</button>
              </div>

              {/* Speed */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Speed:</span>
                {[['0.5×', 2400], ['1×', 1200], ['2×', 600], ['4×', 300]].map(([label, ms]) => (
                  <button key={label} onClick={() => setAutoSpeed(ms)} style={{
                    padding: '4px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                    background: autoSpeed === ms ? '#8b5cf6' : '#f1f5f9', color: autoSpeed === ms ? 'white' : '#6b7280',
                  }}>{label}</button>
                ))}
              </div>

              {/* Step counter */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                  Step <strong style={{ color: '#374151' }}>{currentStep + 1}</strong> of <strong style={{ color: '#374151' }}>{filteredSteps.length}</strong>
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>({steps.length} total)</span>
              </div>
            </div>

            {/* Progress bar */}
            <ProgressBar current={currentStep} total={filteredSteps.length} />

            {/* Phase filter + search */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <PhaseTabs activePhase={phaseFilter} onChange={f => { setPhaseFilter(f); setCurrentStep(0); }} />
              <input
                placeholder="Search steps…"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentStep(0); }}
                style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', background: '#f8fafc', width: '180px' }}
              />
            </div>

            {/* Phase summary badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.entries(phaseCounts).map(([phase, count]) => {
                const pm = PHASE_META[phase];
                return (
                  <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '99px', background: pm.bg, border: `1px solid ${pm.color}30`, fontSize: '11px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: pm.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: pm.color }}>{pm.label}</span>
                    <span style={{ color: '#94a3b8' }}>{count} steps</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Two-column layout ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '14px', alignItems: 'start' }}>

            {/* Left: step list */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                Steps ({filteredSteps.length})
              </div>
              <div ref={stepListRef} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {filteredSteps.map((step, i) => (
                  <div key={step.id} data-active={i === currentStep ? 'true' : 'false'}>
                    <StepCard step={step} isActive={i === currentStep} onClick={() => setCurrentStep(i)} />
                  </div>
                ))}
              </div>
            </div>

            {/* Right: detail */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <StepDetail
                step={activeStep}
                assignments={assignmentSnapshots[activeStep?.id] || []}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    padding: '7px 11px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#f8fafc' : 'white', color: disabled ? '#d1d5db' : '#374151',
    fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
  };
}
