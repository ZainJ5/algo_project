/**
 * ============================================================
 *  TIMETABLE SCHEDULING ALGORITHM
 *  Algorithm: Greedy Construction + Progressive Constraint Relaxation
 * ============================================================
 *
 * PHASE 1 — Greedy Construction (Strict)
 *   Sort sections by constraint density (most constrained first).
 *   For each section, try every (room, day, slot-combo) in priority order.
 *   Accept first assignment that violates zero HARD constraints.
 *
 * PHASE 2 — Repair (retry unassigned — earlier phases may free combos)
 *
 * PHASE 3 — Relax H3 for Electives
 *   Elective courses don't block each other via H3.
 *   Students self-select electives so they can't double-book.
 *
 * PHASE 4 — Relax H3 for Section Groups
 *   Section A and Section B serve different student cohorts.
 *   Allow H3 overlap when sections belong to different groups.
 *
 * PHASE 5 — Soft Lab Placement (skip H2)
 *   Labs whose instructor is physically overloaded get scheduled
 *   with instructor set to TBD (skip H2). H1 & H3 still enforced.
 *
 * PHASE 6 — Force Place (skip H2 + H3) — last resort
 *
 * HARD CONSTRAINTS
 *   H1 — No two sections share same room + time slot
 *   H2 — No instructor teaches two sections at same time slot
 *   H3 — No program+year has two lectures at same time slot
 *   H4 — Room capacity >= section enrollment
 *   H5 — Instructor Minimum Gap: any two teaching slots for the same
 *         instructor on the same day must differ by at least MIN_GAP+1
 *         slots (default MIN_GAP = 2 → slots must be 3+ apart).
 *         Example: slot 0 and slot 2 (diff=2) → VIOLATION
 *                  slot 0 and slot 3 (diff=3) → OK
 *
 * ASSUMPTIONS (matching real institution timetable, Spring 2025)
 *   • 5-day week: Mon–Fri
 *   • 8 slots per day: 08:00, 09:00, 10:30, 11:30, 12:30,
 *     then LUNCH BREAK, then 14:30, 15:30, 16:30
 *   • 3-CH = 3 days x 1 slot (prefer MWF)
 *   • 2-CH = 2 days x 1 slot (prefer TTh)
 *   • 1-CH lab = 3 consecutive slots on ONE day, not crossing lunch
 *   • Default enrollment = 40
 *   • ES LH4 excluded (quiz hall)
 *   • Electives don't trigger H3
 *   • Different section groups (A vs B) can share time in H3
 *   • Instructor min gap = 2 slots (e.g. slot 0 & slot 3 OK,
 *     slot 0 & slot 2 REJECTED — too close)
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

export const BREAK_AFTER_SLOT = 4;

// ── Slot Combinations ──────────────────────────────────────────────────────

function getSlotCombinations(creditHours, isLab) {
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
    return combos;
  }

  if (creditHours === 3) {
    // All C(5,3)=10 day combos, MWF first
    const dc = [];
    for (let a = 0; a < 5; a++)
      for (let b = a + 1; b < 5; b++)
        for (let c = b + 1; c < 5; c++)
          dc.push([a, b, c]);
    dc.sort((x, y) => {
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
      const xT = (x[0] === 1 && x[1] === 3) ? 0 : 1;
      const yT = (y[0] === 1 && y[1] === 3) ? 0 : 1;
      return xT - yT;
    });
    for (let h = 0; h < 8; h++)
      for (const [a, b] of dc)
        combos.push([{ day: a, hour: h }, { day: b, hour: h }]);
    return combos;
  }

  // 1-CH single slot (non-lab)
  for (const d of DAYS)
    for (const h of HOURS)
      combos.push([{ day: d, hour: h }]);
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

// ── Instructor minimum-gap constraint ───────────────────────────────────────
//  Any two teaching slots for the same instructor on the same day must
//  differ by more than MIN_GAP slot indices.
//  MIN_GAP = 2 → slot 0 & slot 2 (diff 2) is TOO CLOSE; slot 0 & slot 3 (diff 3) is OK.

const DEFAULT_MIN_GAP = 2;

/**
 * Returns true if assigning newSlots to this instructor would place two
 * slots on the same day whose indices differ by ≤ minGap.
 */
function wouldViolateInstructorGap(instructorName, newSlots, assignments, minGap = DEFAULT_MIN_GAP) {
  if (!instructorName || instructorName === 'TBA') return false;

  // Group new slots by day
  const dayMap = {};
  for (const s of newSlots) {
    (dayMap[s.day] ||= new Set()).add(s.hour);
  }

  for (const [dayStr, newHours] of Object.entries(dayMap)) {
    const day = Number(dayStr);
    // collect all hours this instructor already teaches on this day
    const hoursOnDay = new Set(newHours);
    for (const a of assignments) {
      const aI = a.instructorName || '';
      if (aI !== instructorName) continue;
      for (const s of a.slots) {
        if (s.day === day) hoursOnDay.add(s.hour);
      }
    }
    // Check every pair — if any two are within minGap, reject
    const sorted = [...hoursOnDay].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= minGap) return true;
    }
  }
  return false;
}

// ── Conflict detection ─────────────────────────────────────────────────────

/**
 * Check conflicts between a proposed assignment and existing assignments.
 *
 * flags:
 *   skipH2           - ignore instructor conflicts
 *   skipH3           - ignore all program conflicts
 *   relaxH3Electives - skip H3 when either section is an elective
 *   relaxH3Groups    - skip H3 when sections have different group letters
 */
function checkConflicts(proposed, existing, flags = {}) {
  const {
    roomName, slots, program, instructorName, enrollment, roomCapacity,
    yearLevel, courseCode, sectionGroup, isElective,
  } = proposed;
  const { skipH2 = false, skipH3 = false, relaxH3Electives = false, relaxH3Groups = false } = flags;

  const violations = [];

  // H4 — capacity
  if (enrollment > roomCapacity) {
    violations.push('H4');
  }

  for (const ex of existing) {
    for (const ps of slots) {
      for (const es of ex.slots) {
        if (ps.day !== es.day || ps.hour !== es.hour) continue;

        // H1 — room conflict (never relaxed)
        if (ex.roomName === roomName) {
          violations.push('H1');
        }

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
          // Same course parallel sections can overlap (different student sub-groups)
          if (courseCode && ex.courseCode && courseCode === ex.courseCode) continue;
          // No program = open elective, skip
          if (!program || !ex.program) continue;
          // Must have overlapping atomic programs
          if (!programsOverlap(program, ex.program)) continue;
          // Year-level check: same year only. yr>0 required for valid comparison
          const pY = yearLevel || 0;
          const eY = ex.yearLevel || 0;
          if (pY > 0 && eY > 0 && pY !== eY) continue;
          // Elective relaxation
          if (relaxH3Electives && (isElective || ex.isElective)) continue;
          // Group relaxation: A≠B means different student cohorts
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
    // Real instructor first
    const aI = a.instructorName !== 'TBA' ? 1 : 0;
    const bI = b.instructorName !== 'TBA' ? 1 : 0;
    if (bI !== aI) return bI - aI;
    // Non-elective first (harder to place)
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

function tryPlace(sec, rooms, assignments, flags = {}) {
  const { enforceGap = true, minGap = DEFAULT_MIN_GAP, ...conflictFlags } = flags;
  const orderedRooms = sortRooms(rooms, sec);
  const combos = getSlotCombinations(sec.creditHours, sec.isLab);

  for (const combo of combos) {
    // Check instructor-gap constraint before room scan
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

// ── Phase implementations ──────────────────────────────────────────────────

function phase1(sections, rooms) {
  const assignments = [];
  const unassigned  = [];
  for (const sec of sortByConstraintDensity(sections)) {
    const p = tryPlace(sec, rooms, assignments);
    (p ? assignments : unassigned).push(p || sec);
  }
  return { assignments: assignments.filter(Boolean), unassigned };
}

function phase2(assignments, unassigned, rooms) {
  let rem = unassigned;
  for (let i = 0; i < 5 && rem.length > 0; i++) {
    const next = [];
    for (const sec of rem) {
      const p = tryPlace(sec, rooms, assignments);
      if (p) assignments.push(p); else next.push(sec);
    }
    if (next.length === rem.length) break;
    rem = next;
  }
  return { assignments, unassigned: rem };
}

function phase3(assignments, unassigned, rooms) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { relaxH3Electives: true });
    if (p) assignments.push(p); else still.push(sec);
  }
  return { assignments, unassigned: still };
}

function phase4(assignments, unassigned, rooms) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { relaxH3Electives: true, relaxH3Groups: true });
    if (p) assignments.push(p); else still.push(sec);
  }
  return { assignments, unassigned: still };
}

function phase5(assignments, unassigned, rooms) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { skipH2: true, relaxH3Electives: true, relaxH3Groups: true, enforceGap: false });
    if (p) {
      const n = p.instructorName || 'TBA';
      if (n !== 'TBA' && !n.endsWith('(TBD)')) p.instructorName = n + ' (TBD)';
      assignments.push(p);
    } else {
      still.push(sec);
    }
  }
  return { assignments, unassigned: still };
}

function phase6(assignments, unassigned, rooms) {
  const still = [];
  for (const sec of unassigned) {
    const p = tryPlace(sec, rooms, assignments, { skipH2: true, skipH3: true, enforceGap: false });
    if (p) {
      const n = (p.instructorName || 'TBA').replace(/ \(TBD\)$/, '');
      p.instructorName = n + ' (FORCE)';
      assignments.push(p);
    } else {
      still.push(sec);
    }
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

          // H2 (skip TBA/TBD/FORCE)
          const aI = a.instructorName || '';
          const bI = b.instructorName || '';
          if (aI && bI && aI !== 'TBA' && bI !== 'TBA' &&
              !aI.endsWith('(TBD)') && !bI.endsWith('(TBD)') &&
              !aI.endsWith('(FORCE)') && !bI.endsWith('(FORCE)') &&
              aI === bI) {
            count++;
          }

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

  let { assignments, unassigned } = phase1(sections, rooms);
  console.log(`  Phase 1 (Strict):          ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase2(assignments, unassigned, rooms));
  console.log(`  Phase 2 (Repair):          ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase3(assignments, unassigned, rooms));
  console.log(`  Phase 3 (Relax Electives): ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase4(assignments, unassigned, rooms));
  console.log(`  Phase 4 (Relax Groups):    ${assignments.length} placed, ${unassigned.length} remain`);

  ({ assignments, unassigned } = phase5(assignments, unassigned, rooms));
  console.log(`  Phase 5 (Soft Labs):       ${assignments.length} placed, ${unassigned.length} remain`);

  if (unassigned.length > 0) {
    ({ assignments, unassigned } = phase6(assignments, unassigned, rooms));
    console.log(`  Phase 6 (Force):           ${assignments.length} placed, ${unassigned.length} remain`);
  }

  // Mark truly unschedulable
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
