/**
 * ============================================================
 *  TIMETABLE SCHEDULING ALGORITHM
 *  Greedy Construction + Backtracking Swap Repair
 * ============================================================
 *
 * PHASE 1 — Greedy Construction (strict)
 *   Sort sections by constraint density (most constrained first).
 *   Larger enrollment classes go first to claim big rooms.
 *   For each section, try every (room, slot-combo) in priority order.
 *   Day combos are load-balanced to avoid MWF congestion.
 *
 * PHASE 2 — Backtracking Swap Repair
 *   For each unassigned section U, find a placed section V that
 *   *conflicts* with U. Remove V, place U, then re-place V
 *   elsewhere. If V can't be re-placed, undo and try next V.
 *
 * PHASE 3 — Relax H3 for Electives
 * PHASE 4 — Relax H3 for Section Groups
 * PHASE 5 — Soft Lab (skip H2, mark TBD)
 * PHASE 6 — Force Place (skip H2+H3, mark FORCE) — last resort
 *
 * HARD CONSTRAINTS
 *   H1 — Room uniqueness (same room+slot)
 *   H2 — Instructor uniqueness (same instructor+slot)
 *   H3 — Program-year conflict (same program+year+slot)
 *   H4 — Room capacity >= enrollment
 *   H5 — Instructor gap: between *different sections* on the same
 *         day, the gap must be > MIN_GAP slots. Internal slots of
 *         one multi-slot section (e.g. lab) are exempt. The lunch
 *         break between slot 4 and 5 counts as an extra gap of 1.
 * ============================================================
 */

// ── Constants ──────────────────────────────────────────────────────────────

export const DAYS     = [0, 1, 2, 3, 4];
export const HOURS    = [0, 1, 2, 3, 4, 5, 6, 7];
export const DAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const HOUR_LABEL = [
  '08:00–08:50',   // 0
  '09:00–09:50',   // 1
  '10:30–11:20',   // 2
  '11:30–12:20',   // 3
  '12:30–13:20',   // 4
  '14:30–15:20',   // 5
  '15:30–16:20',   // 6
  '16:30–17:20',   // 7
];

export const BREAK_AFTER_SLOT = 4;  // lunch gap lives between slot 4 and 5

const DEFAULT_MIN_GAP = 2;

// ── Day-load tracker (keeps schedule balanced across days) ────────────────

function createDayLoad() {
  return [0, 0, 0, 0, 0]; // Mon–Fri
}

function recordLoad(dayLoad, combo) {
  for (const s of combo) dayLoad[s.day]++;
}

function unrecordLoad(dayLoad, combo) {
  for (const s of combo) dayLoad[s.day]--;
}

// ── Slot Combinations (with day-load balancing) ────────────────────────────

function getSlotCombinations(creditHours, isLab, dayLoad) {
  const combos = [];

  if (isLab) {
    // 3 consecutive slots on one day; valid starts: 0,1,2 (morning), 5 (afternoon)
    const starts = [0, 1, 2, 5];
    for (const day of DAYS) {
      for (const h of starts) {
        if (h + 2 > 7) continue;
        combos.push([{ day, hour: h }, { day, hour: h + 1 }, { day, hour: h + 2 }]);
      }
    }
    // Sort: prefer the day with least current load
    if (dayLoad) {
      combos.sort((a, b) => dayLoad[a[0].day] - dayLoad[b[0].day]);
    }
    return combos;
  }

  if (creditHours === 3) {
    const dc = [];
    for (let a = 0; a < 5; a++)
      for (let b = a + 1; b < 5; b++)
        for (let c = b + 1; c < 5; c++)
          dc.push([a, b, c]);
    // Sort by total day-load of the 3 chosen days (lightest first)
    // Tie-break: prefer MWF
    dc.sort((x, y) => {
      if (dayLoad) {
        const xL = dayLoad[x[0]] + dayLoad[x[1]] + dayLoad[x[2]];
        const yL = dayLoad[y[0]] + dayLoad[y[1]] + dayLoad[y[2]];
        if (xL !== yL) return xL - yL;
      }
      const xM = (x[0] === 0 && x[1] === 2 && x[2] === 4) ? 0 : 1;
      const yM = (y[0] === 0 && y[1] === 2 && y[2] === 4) ? 0 : 1;
      return xM - yM;
    });
    for (let h = 0; h < 8; h++)
      for (const [a, b, c] of dc)
        combos.push([{ day: a, hour: h }, { day: b, hour: h }, { day: c, hour: h }]);
    return combos;
  }

  if (creditHours === 2) {
    const dc = [];
    for (let a = 0; a < 5; a++)
      for (let b = a + 1; b < 5; b++)
        dc.push([a, b]);
    dc.sort((x, y) => {
      if (dayLoad) {
        const xL = dayLoad[x[0]] + dayLoad[x[1]];
        const yL = dayLoad[y[0]] + dayLoad[y[1]];
        if (xL !== yL) return xL - yL;
      }
      const xT = (x[0] === 1 && x[1] === 3) ? 0 : 1;
      const yT = (y[0] === 1 && y[1] === 3) ? 0 : 1;
      return xT - yT;
    });
    for (let h = 0; h < 8; h++)
      for (const [a, b] of dc)
        combos.push([{ day: a, hour: h }, { day: b, hour: h }]);
    return combos;
  }

  // 1-CH single slot
  for (const d of DAYS)
    for (const h of HOURS)
      combos.push([{ day: d, hour: h }]);
  if (dayLoad) combos.sort((a, b) => dayLoad[a[0].day] - dayLoad[b[0].day]);
  return combos;
}

// ── Program helpers ────────────────────────────────────────────────────────

function splitPrograms(p) {
  if (!p) return [];
  return p.split(/[+,]/).map(s => s.trim()).filter(Boolean);
}

function programsOverlap(p1, p2) {
  if (!p1 || !p2) return false;
  const set2 = new Set(splitPrograms(p2));
  return splitPrograms(p1).some(p => set2.has(p));
}

// ── Instructor minimum-gap (FIXED: inter-section only, lunch-aware) ───────
//
//  Gap is measured between DIFFERENT sections for the same instructor on
//  the same day. The internal consecutive slots of a single section (e.g.
//  a 3-slot lab) are NOT checked against each other.
//
//  Lunch break (between slot 4 and slot 5) adds +1 to the effective gap,
//  so scheduling at slot 4 and slot 5 gives effective gap = 2 (1 index +
//  1 lunch bonus), which equals MIN_GAP and is still a violation. Slot 4
//  and slot 6 gives effective gap = 3 → OK.

/**
 * Compute effective gap between two slot indices, accounting for lunch.
 */
function effectiveGap(h1, h2) {
  const lo = Math.min(h1, h2);
  const hi = Math.max(h1, h2);
  let gap = hi - lo;
  // If the two slots straddle the lunch break, add 1
  if (lo <= BREAK_AFTER_SLOT && hi > BREAK_AFTER_SLOT) gap += 1;
  return gap;
}

/**
 * Returns true if assigning newSlots to this instructor would create a
 * gap violation with a DIFFERENT already-scheduled section.
 */
function wouldViolateInstructorGap(instructorName, newSlots, assignments, minGap = DEFAULT_MIN_GAP) {
  if (!instructorName || instructorName === 'TBA') return false;

  // Build per-day range for the proposed section
  const propByDay = {};  // day → { min, max }
  for (const s of newSlots) {
    const e = propByDay[s.day];
    if (!e) propByDay[s.day] = { min: s.hour, max: s.hour };
    else { if (s.hour < e.min) e.min = s.hour; if (s.hour > e.max) e.max = s.hour; }
  }

  for (const a of assignments) {
    const aI = a.instructorName || '';
    if (aI !== instructorName) continue;

    // Build per-day range for this existing section
    const existByDay = {};
    for (const s of a.slots) {
      const e = existByDay[s.day];
      if (!e) existByDay[s.day] = { min: s.hour, max: s.hour };
      else { if (s.hour < e.min) e.min = s.hour; if (s.hour > e.max) e.max = s.hour; }
    }

    // Check each shared day
    for (const dayStr of Object.keys(propByDay)) {
      const day = Number(dayStr);
      const ex = existByDay[day];
      if (!ex) continue;
      const pr = propByDay[day];

      // Gap = closest edges between the two sections
      // Either proposed is after existing, or before
      const gap1 = effectiveGap(ex.max, pr.min); // existing ends, proposed starts
      const gap2 = effectiveGap(pr.max, ex.min); // proposed ends, existing starts
      const gap  = Math.min(gap1, gap2);

      // If sections overlap (gap would be 0 or negative in raw terms),
      // that's caught by H2, not H5. Only flag true gaps that are too small.
      if (gap > 0 && gap <= minGap) return true;
    }
  }
  return false;
}

// ── Conflict detection ─────────────────────────────────────────────────────

function checkConflicts(proposed, existing, flags = {}) {
  const {
    roomName, slots, program, instructorName, enrollment, roomCapacity,
    yearLevel, courseCode, sectionGroup, isElective,
  } = proposed;
  const { skipH2 = false, skipH3 = false, relaxH3Electives = false, relaxH3Groups = false } = flags;

  const violations = [];

  // H4 — capacity
  if (enrollment > roomCapacity) violations.push('H4');

  for (const ex of existing) {
    for (const ps of slots) {
      for (const es of ex.slots) {
        if (ps.day !== es.day || ps.hour !== es.hour) continue;

        // H1 — room conflict
        if (ex.roomName === roomName) violations.push('H1');

        // H2 — instructor conflict
        if (!skipH2) {
          const pI = instructorName || '';
          const eI = ex.instructorName || '';
          if (pI && pI !== 'TBA' && eI && eI !== 'TBA' &&
              !pI.endsWith('(TBD)') && !eI.endsWith('(TBD)') &&
              !pI.endsWith('(FORCE)') && !eI.endsWith('(FORCE)') &&
              pI === eI) {
            violations.push('H2');
          }
        }

        // H3 — program conflict
        if (!skipH3) {
          if (courseCode && ex.courseCode && courseCode === ex.courseCode) continue;
          if (!program || !ex.program) continue;
          if (!programsOverlap(program, ex.program)) continue;
          const pY = yearLevel || 0;
          const eY = ex.yearLevel || 0;
          if (pY > 0 && eY > 0 && pY !== eY) continue;
          if (relaxH3Electives && (isElective || ex.isElective)) continue;
          if (relaxH3Groups) {
            const pG = sectionGroup || '';
            const eG = ex.sectionGroup || '';
            if (pG && eG && pG !== eG) continue;
          }
          violations.push('H3');
        }
      }
    }
  }

  return violations;
}

// ── Sort heuristic ─────────────────────────────────────────────────────────

function sortByConstraintDensity(sections) {
  return [...sections].sort((a, b) => {
    // Larger enrollment first — claim big rooms before small classes steal them
    if ((b.enrollment || 40) !== (a.enrollment || 40)) return (b.enrollment || 40) - (a.enrollment || 40);
    // Real instructor first
    const aI = a.instructorName !== 'TBA' ? 1 : 0;
    const bI = b.instructorName !== 'TBA' ? 1 : 0;
    if (bI !== aI) return bI - aI;
    // Non-elective first
    const aE = a.isElective ? 0 : 1;
    const bE = b.isElective ? 0 : 1;
    if (bE !== aE) return bE - aE;
    // Higher CH first
    if (b.creditHours !== a.creditHours) return b.creditHours - a.creditHours;
    // More program codes = more constrained
    return splitPrograms(b.program).length - splitPrograms(a.program).length;
  });
}

// ── Room ordering ──────────────────────────────────────────────────────────

function sortRooms(rooms, section) {
  return [...rooms].sort((a, b) => {
    const aM = a.allocation && section.program && a.allocation.includes(section.program) ? 1 : 0;
    const bM = b.allocation && section.program && b.allocation.includes(section.program) ? 1 : 0;
    if (bM !== aM) return bM - aM;
    const aF = a.capacity - (section.enrollment || 40);
    const bF = b.capacity - (section.enrollment || 40);
    if (aF < 0) return 1;
    if (bF < 0) return -1;
    return aF - bF;
  });
}

// ── Build proposed assignment ──────────────────────────────────────────────

function makeProposed(sec, room, combo) {
  return {
    sectionId:      sec._id,
    courseCode:      sec.courseCode,
    courseTitle:     sec.courseTitle,
    sectionLabel:   sec.sectionLabel,
    program:        sec.program,
    instructorName: sec.instructorName,
    isLab:          sec.isLab,
    isElective:     sec.isElective || false,
    sectionGroup:   sec.sectionGroup || '',
    creditHours:    sec.creditHours,
    yearLevel:      sec.yearLevel || 0,
    enrollment:     sec.enrollment || 40,
    slots:          combo,
    roomName:       room.name,
    roomCapacity:   room.capacity,
  };
}

// ── Try to place a single section ──────────────────────────────────────────

function tryPlace(sec, rooms, assignments, flags = {}, dayLoad = null) {
  const { enforceGap = true, minGap = DEFAULT_MIN_GAP, ...conflictFlags } = flags;
  const orderedRooms = sortRooms(rooms, sec);
  const combos = getSlotCombinations(sec.creditHours, sec.isLab, dayLoad);

  for (const combo of combos) {
    if (enforceGap &&
        wouldViolateInstructorGap(sec.instructorName, combo, assignments, minGap)) {
      continue;
    }
    for (const room of orderedRooms) {
      if (room.capacity < (sec.enrollment || 40)) continue;
      const proposed = makeProposed(sec, room, combo);
      if (checkConflicts(proposed, assignments, conflictFlags).length === 0) {
        return proposed;
      }
    }
  }
  return null;
}

// ── Phase 1: Strict Greedy ─────────────────────────────────────────────────

function phase1(sections, rooms) {
  const assignments = [];
  const unassigned  = [];
  const dayLoad = createDayLoad();
  for (const sec of sortByConstraintDensity(sections)) {
    const p = tryPlace(sec, rooms, assignments, {}, dayLoad);
    if (p) { assignments.push(p); recordLoad(dayLoad, p.slots); }
    else unassigned.push(sec);
  }
  return { assignments, unassigned, dayLoad };
}

// ── Phase 2: Backtracking Swap Repair ──────────────────────────────────────
//  For each unassigned section U:
//    1. Find placed sections that conflict with U on at least one slot.
//    2. Try removing that section V, placing U, then re-placing V elsewhere.
//    3. If V re-places successfully → keep both. Otherwise undo.

function phase2(assignments, unassigned, rooms, dayLoad) {
  const still = [];

  for (const sec of unassigned) {
    // First try direct placement (no swap)
    const direct = tryPlace(sec, rooms, assignments, {}, dayLoad);
    if (direct) {
      assignments.push(direct);
      recordLoad(dayLoad, direct.slots);
      continue;
    }

    // Attempt swap: find candidate victims
    let placed = false;
    for (let vi = 0; vi < assignments.length && !placed; vi++) {
      const victim = assignments[vi];
      // Only consider swapping if victim shares instructor or room/slot overlap
      if (!wouldBenefitSwap(sec, victim)) continue;

      // Remove victim
      const removed = assignments.splice(vi, 1)[0];
      unrecordLoad(dayLoad, removed.slots);

      // Try placing sec
      const pU = tryPlace(sec, rooms, assignments, {}, dayLoad);
      if (pU) {
        assignments.push(pU);
        recordLoad(dayLoad, pU.slots);
        // Try re-placing victim
        const pV = tryPlace(removed, rooms, assignments, {}, dayLoad);
        if (pV) {
          assignments.push(pV);
          recordLoad(dayLoad, pV.slots);
          placed = true;
        } else {
          // Undo: remove pU, restore victim
          const idx = assignments.indexOf(pU);
          if (idx >= 0) assignments.splice(idx, 1);
          unrecordLoad(dayLoad, pU.slots);
          assignments.splice(vi, 0, removed);
          recordLoad(dayLoad, removed.slots);
        }
      } else {
        // Can't place sec even after removing victim — restore
        assignments.splice(vi, 0, removed);
        recordLoad(dayLoad, removed.slots);
      }
    }

    if (!placed) still.push(sec);
  }

  return { assignments, unassigned: still, dayLoad };
}

/** Quick check: would removing victim potentially help place sec? */
function wouldBenefitSwap(sec, victim) {
  // Same instructor → removing victim frees instructor slots
  if (sec.instructorName && sec.instructorName !== 'TBA' &&
      sec.instructorName === victim.instructorName) return true;
  // Overlapping program+year → removing victim frees H3 slots
  if (programsOverlap(sec.program, victim.program)) {
    const sY = sec.yearLevel || 0;
    const vY = victim.yearLevel || 0;
    if (sY === 0 || vY === 0 || sY === vY) return true;
  }
  return false;
}

// ── Phases 3–6 (progressive relaxation) ────────────────────────────────────

function phase3(assignments, unassigned, rooms, dayLoad) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { relaxH3Electives: true }, dayLoad);
    if (p) { assignments.push(p); recordLoad(dayLoad, p.slots); }
    else still.push(sec);
  }
  return { assignments, unassigned: still };
}

function phase4(assignments, unassigned, rooms, dayLoad) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { relaxH3Electives: true, relaxH3Groups: true }, dayLoad);
    if (p) { assignments.push(p); recordLoad(dayLoad, p.slots); }
    else still.push(sec);
  }
  return { assignments, unassigned: still };
}

function phase5(assignments, unassigned, rooms, dayLoad) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments,
      { skipH2: true, relaxH3Electives: true, relaxH3Groups: true, enforceGap: false }, dayLoad);
    if (p) {
      const n = p.instructorName || 'TBA';
      if (n !== 'TBA' && !n.endsWith('(TBD)')) p.instructorName = n + ' (TBD)';
      assignments.push(p);
      recordLoad(dayLoad, p.slots);
    } else still.push(sec);
  }
  return { assignments, unassigned: still };
}

function phase6(assignments, unassigned, rooms, dayLoad) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments,
      { skipH2: true, skipH3: true, enforceGap: false }, dayLoad);
    if (p) {
      const n = (p.instructorName || 'TBA').replace(/ \(TBD\)$/, '');
      p.instructorName = n + ' (FORCE)';
      assignments.push(p);
      recordLoad(dayLoad, p.slots);
    } else still.push(sec);
  }
  return { assignments, unassigned: still };
}

// ── Count hard violations in final schedule ────────────────────────────────

export function countHardViolations(assignments) {
  let count = 0;
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    for (let j = i + 1; j < assignments.length; j++) {
      const b = assignments[j];
      for (const as of a.slots) {
        for (const bs of b.slots) {
          if (as.day !== bs.day || as.hour !== bs.hour) continue;

          // H1
          if (a.roomName === b.roomName) count++;

          // H2
          const aI = a.instructorName || '';
          const bI = b.instructorName || '';
          if (aI && bI && aI !== 'TBA' && bI !== 'TBA' &&
              !aI.endsWith('(TBD)') && !bI.endsWith('(TBD)') &&
              !aI.endsWith('(FORCE)') && !bI.endsWith('(FORCE)') &&
              aI === bI) count++;

          // H3
          if (a.courseCode && b.courseCode && a.courseCode === b.courseCode) continue;
          if (!a.program || !b.program) continue;
          if (!programsOverlap(a.program, b.program)) continue;
          const aY = a.yearLevel || 0;
          const bY = b.yearLevel || 0;
          if (aY > 0 && bY > 0 && aY !== bY) continue;
          if (a.isElective || b.isElective) continue;
          const aG = a.sectionGroup || '';
          const bG = b.sectionGroup || '';
          if (aG && bG && aG !== bG) continue;
          if (aI.endsWith('(FORCE)') || bI.endsWith('(FORCE)')) continue;
          count++;
        }
      }
    }
  }
  return count;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function runScheduler(sections, rooms) {
  console.log(`\n=== SCHEDULING ${sections.length} sections into ${rooms.length} rooms ===\n`);

  let { assignments, unassigned, dayLoad } = phase1(sections, rooms);
  console.log(`  Phase 1 (Strict Greedy):   ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned, dayLoad } = phase2(assignments, unassigned, rooms, dayLoad));
  console.log(`  Phase 2 (Swap Repair):     ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase3(assignments, unassigned, rooms, dayLoad));
  console.log(`  Phase 3 (Relax Electives): ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase4(assignments, unassigned, rooms, dayLoad));
  console.log(`  Phase 4 (Relax Groups):    ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase5(assignments, unassigned, rooms, dayLoad));
  console.log(`  Phase 5 (Soft Labs):       ${assignments.length} placed, ${unassigned.length} remain`);

  if (unassigned.length > 0) {
    ({ assignments, unassigned } = phase6(assignments, unassigned, rooms, dayLoad));
    console.log(`  Phase 6 (Force):           ${assignments.length} placed, ${unassigned.length} remain`);
  }

  for (const sec of unassigned) {
    assignments.push({
      ...makeProposed(sec, { name: 'UNSCHEDULED', capacity: 0 }, []),
      roomCapacity: 0,
    });
  }

  const scheduled = assignments.filter(a => a.roomName !== 'UNSCHEDULED');
  const hardViolations = countHardViolations(scheduled);

  console.log(`\n  RESULT: ${scheduled.length}/${sections.length} scheduled, ${hardViolations} violations\n`);

  return { assignments, unassigned, hardViolations, softScore: scheduled.length };
}
