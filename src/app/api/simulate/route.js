import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import Section from '@/models/Section';

/**
 * POST /api/simulate
 * Runs the scheduling algorithm with full step-by-step trace.
 * Returns: { steps: [...], finalAssignments, stats }
 */

// ── Constants (mirrored from scheduler.js) ─────────────────────────────────
const DAYS     = [0, 1, 2, 3, 4];
const DAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS    = [0, 1, 2, 3, 4, 5, 6, 7];
const HOUR_LABEL = [
  '08:30–09:20', '09:30–10:20', '10:30–11:20', '11:30–12:20',
  '12:30–13:20', '14:30–15:20', '15:30–16:20', '16:30–17:20',
];
const BREAK_AFTER_SLOT = 4;
const DEFAULT_MIN_GAP  = 1;

function createDayLoad() { return [0, 0, 0, 0, 0]; }
function recordLoad(dl, combo) { for (const s of combo) dl[s.day]++; }
function unrecordLoad(dl, combo) { for (const s of combo) dl[s.day]--; }

function effectiveGap(h1, h2) {
  const lo = Math.min(h1, h2); const hi = Math.max(h1, h2);
  let gap = hi - lo;
  if (lo <= BREAK_AFTER_SLOT && hi > BREAK_AFTER_SLOT) gap += 2;
  return gap;
}

function slotsOverlap(h1, h2) { return h1 === h2; }

function splitPrograms(p) {
  if (!p) return [];
  return p.split(/[+,]/).map(s => s.trim()).filter(Boolean);
}

function programsOverlap(p1, p2) {
  if (!p1 || !p2) return false;
  const set2 = new Set(splitPrograms(p2));
  return splitPrograms(p1).some(p => set2.has(p));
}

function wouldViolateInstructorGap(instructorName, newSlots, assignments, minGap = DEFAULT_MIN_GAP) {
  if (!instructorName || instructorName === 'TBA') return false;
  const propByDay = {};
  for (const s of newSlots) {
    const e = propByDay[s.day];
    if (!e) propByDay[s.day] = { min: s.hour, max: s.hour };
    else { if (s.hour < e.min) e.min = s.hour; if (s.hour > e.max) e.max = s.hour; }
  }
  for (const a of assignments) {
    const aI = a.instructorName || '';
    if (aI !== instructorName) continue;
    const existByDay = {};
    for (const s of a.slots) {
      const e = existByDay[s.day];
      if (!e) existByDay[s.day] = { min: s.hour, max: s.hour };
      else { if (s.hour < e.min) e.min = s.hour; if (s.hour > e.max) e.max = s.hour; }
    }
    for (const dayStr of Object.keys(propByDay)) {
      const day = Number(dayStr);
      const ex = existByDay[day];
      if (!ex) continue;
      const pr = propByDay[day];
      const gap1 = effectiveGap(ex.max, pr.min);
      const gap2 = effectiveGap(pr.max, ex.min);
      const gap  = Math.min(gap1, gap2);
      if (gap > 0 && gap <= minGap) return true;
    }
  }
  return false;
}

function checkConflicts(proposed, existing, flags = {}) {
  const { roomName, slots, program, instructorName, enrollment, roomCapacity,
    yearLevel, courseCode, sectionGroup, isElective } = proposed;
  const { skipH2 = false, skipH3 = false, relaxH3Electives = false, relaxH3Groups = false } = flags;
  const violations = [];
  if (enrollment > roomCapacity) violations.push('H4');
  for (const ex of existing) {
    for (const ps of slots) {
      for (const es of ex.slots) {
        if (ps.day !== es.day) continue;
        if (!slotsOverlap(ps.hour, es.hour)) continue;
        if (ex.roomName === roomName) violations.push('H1');
        if (!skipH2) {
          const pI = instructorName || ''; const eI = ex.instructorName || '';
          if (pI && pI !== 'TBA' && eI && eI !== 'TBA' &&
              !pI.endsWith('(TBD)') && !eI.endsWith('(TBD)') &&
              !pI.endsWith('(FORCE)') && !eI.endsWith('(FORCE)') && pI === eI) {
            violations.push('H2');
          }
        }
        if (!skipH3) {
          if (courseCode && ex.courseCode && courseCode === ex.courseCode) continue;
          if (!program || !ex.program) continue;
          if (!programsOverlap(program, ex.program)) continue;
          const pY = yearLevel || 0; const eY = ex.yearLevel || 0;
          if (pY > 0 && eY > 0 && pY !== eY) continue;
          if (relaxH3Electives && (isElective || ex.isElective)) continue;
          if (relaxH3Groups) {
            const pG = sectionGroup || ''; const eG = ex.sectionGroup || '';
            if (pG && eG && pG !== eG) continue;
          }
          violations.push('H3');
        }
      }
    }
  }
  return violations;
}

function sortByConstraintDensity(sections) {
  return [...sections].sort((a, b) => {
    if ((b.enrollment || 40) !== (a.enrollment || 40)) return (b.enrollment || 40) - (a.enrollment || 40);
    const aI = a.instructorName !== 'TBA' ? 1 : 0; const bI = b.instructorName !== 'TBA' ? 1 : 0;
    if (bI !== aI) return bI - aI;
    const aE = a.isElective ? 0 : 1; const bE = b.isElective ? 0 : 1;
    if (bE !== aE) return bE - aE;
    if (b.creditHours !== a.creditHours) return b.creditHours - a.creditHours;
    return splitPrograms(b.program).length - splitPrograms(a.program).length;
  });
}

function sortRooms(rooms, section) {
  return [...rooms].sort((a, b) => {
    const aM = a.allocation && section.program && a.allocation.includes(section.program) ? 1 : 0;
    const bM = b.allocation && section.program && b.allocation.includes(section.program) ? 1 : 0;
    if (bM !== aM) return bM - aM;
    const aF = a.capacity - (section.enrollment || 40);
    const bF = b.capacity - (section.enrollment || 40);
    if (aF < 0) return 1; if (bF < 0) return -1;
    return aF - bF;
  });
}

function getSlotCombinations(creditHours, isLab, dayLoad) {
  const combos = [];
  if (isLab) {
    const labStarts = [0, 1, 2, 5];
    for (const day of DAYS)
      for (const h of labStarts)
        combos.push([{ day, hour: h }, { day, hour: h + 1 }, { day, hour: h + 2 }]);
    if (dayLoad) combos.sort((a, b) => dayLoad[a[0].day] - dayLoad[b[0].day]);
    return combos;
  }
  if (creditHours === 3) {
    const dc = [];
    for (let a = 0; a < 5; a++) for (let b = a+1; b < 5; b++) for (let c = b+1; c < 5; c++) dc.push([a,b,c]);
    dc.sort((x, y) => {
      if (dayLoad) { const xL = dayLoad[x[0]]+dayLoad[x[1]]+dayLoad[x[2]]; const yL = dayLoad[y[0]]+dayLoad[y[1]]+dayLoad[y[2]]; if (xL !== yL) return xL - yL; }
      const xM = (x[0]===0&&x[1]===2&&x[2]===4)?0:1; const yM = (y[0]===0&&y[1]===2&&y[2]===4)?0:1;
      return xM - yM;
    });
    for (let h = 0; h < 8; h++) for (const [a,b,c] of dc) combos.push([{day:a,hour:h},{day:b,hour:h},{day:c,hour:h}]);
    return combos;
  }
  if (creditHours === 2) {
    const dc = [];
    for (let a = 0; a < 5; a++) for (let b = a+1; b < 5; b++) dc.push([a,b]);
    dc.sort((x, y) => {
      if (dayLoad) { const xL = dayLoad[x[0]]+dayLoad[x[1]]; const yL = dayLoad[y[0]]+dayLoad[y[1]]; if (xL !== yL) return xL - yL; }
      const xT = (x[0]===1&&x[1]===3)?0:1; const yT = (y[0]===1&&y[1]===3)?0:1;
      return xT - yT;
    });
    for (let h = 0; h < 8; h++) for (const [a,b] of dc) combos.push([{day:a,hour:h},{day:b,hour:h}]);
    return combos;
  }
  for (const d of DAYS) for (const h of HOURS) combos.push([{day:d,hour:h}]);
  if (dayLoad) combos.sort((a, b) => dayLoad[a[0].day] - dayLoad[b[0].day]);
  return combos;
}

function makeProposed(sec, room, combo) {
  return {
    sectionId: sec._id, courseCode: sec.courseCode, courseTitle: sec.courseTitle,
    sectionLabel: sec.sectionLabel, program: sec.program, instructorName: sec.instructorName,
    isLab: sec.isLab, isElective: sec.isElective || false, sectionGroup: sec.sectionGroup || '',
    creditHours: sec.creditHours, yearLevel: sec.yearLevel || 0, enrollment: sec.enrollment || 40,
    slots: combo, roomName: room.name, roomCapacity: room.capacity,
  };
}

function tryPlaceWithTrace(sec, rooms, assignments, flags = {}, dayLoad = null) {
  const { enforceGap = true, minGap = DEFAULT_MIN_GAP, ...conflictFlags } = flags;
  const orderedRooms = sortRooms(rooms, sec);
  const combos = getSlotCombinations(sec.creditHours, sec.isLab, dayLoad);
  const rejectedReasons = [];

  let combosChecked = 0;
  for (const combo of combos) {
    combosChecked++;
    if (enforceGap && wouldViolateInstructorGap(sec.instructorName, combo, assignments, minGap)) {
      rejectedReasons.push({ reason: 'H5-gap', combo });
      continue;
    }
    for (const room of orderedRooms) {
      if (room.capacity < (sec.enrollment || 40)) continue;
      const proposed = makeProposed(sec, room, combo);
      const viols = checkConflicts(proposed, assignments, conflictFlags);
      if (viols.length === 0) {
        return { result: proposed, combosChecked, rejectedReasons: rejectedReasons.slice(-5) };
      }
      rejectedReasons.push({ reason: viols.join('+'), room: room.name, combo });
    }
  }
  return { result: null, combosChecked, rejectedReasons: rejectedReasons.slice(-5) };
}

function wouldBenefitSwap(sec, victim) {
  if (sec.instructorName && sec.instructorName !== 'TBA' && sec.instructorName === victim.instructorName) return true;
  if (programsOverlap(sec.program, victim.program)) {
    const sY = sec.yearLevel || 0; const vY = victim.yearLevel || 0;
    if (sY === 0 || vY === 0 || sY === vY) return true;
  }
  return false;
}

function formatSlots(slots) {
  if (!slots || slots.length === 0) return '';
  return slots.map(s => `${DAY_NAME[s.day]} ${HOUR_LABEL[s.hour]}`).join(', ');
}

// ── Main traced scheduler ──────────────────────────────────────────────────

function runTracedScheduler(sections, rooms, maxSectionsToTrace = 999999) {
  const steps = [];
  let stepId = 0;

  function addStep(type, data) {
    steps.push({ id: stepId++, type, ...data });
  }

  const sorted = sortByConstraintDensity(sections);
  
  addStep('INIT', {
    title: 'Initialization: Sort Sections by Constraint Density',
    description: `${sorted.length} sections sorted. Larger enrollment → more constrained instructors → non-elective → higher credit hours → more program codes. This ensures the hardest-to-place sections claim resources first.`,
    sortedSections: sorted.slice(0, maxSectionsToTrace).map((s, i) => ({
      rank: i + 1,
      courseCode: s.courseCode,
      courseTitle: s.courseTitle,
      sectionLabel: s.sectionLabel,
      program: s.program,
      instructorName: s.instructorName,
      creditHours: s.creditHours,
      isLab: s.isLab,
      isElective: s.isElective,
      enrollment: s.enrollment || 40,
      yearLevel: s.yearLevel,
    })),
    totalSections: sorted.length,
    rooms: rooms.map(r => ({ name: r.name, capacity: r.capacity, isLab: r.isLab, allocation: r.allocation })),
    constraints: [
      { id: 'H1', name: 'Room Uniqueness', description: 'No two classes in the same room at the same time slot.' },
      { id: 'H2', name: 'Instructor Uniqueness', description: 'An instructor cannot teach two sections at the same time slot.' },
      { id: 'H3', name: 'Program-Year Conflict', description: 'Same program + year students cannot have two classes at the same time.' },
      { id: 'H4', name: 'Room Capacity', description: 'Room capacity must be ≥ section enrollment.' },
      { id: 'H5', name: 'Instructor Gap', description: 'Minimum gap between different sections of same instructor on same day.' },
    ],
  });

  // ── PHASE 1 ────────────────────────────────────────────────────────────
  addStep('PHASE_START', {
    phase: 1,
    title: 'Phase 1: Strict Greedy Construction',
    description: 'Try each section in constraint-density order. For each section, find the first valid (room, slot) pair satisfying ALL hard constraints H1–H5. Day-load balancing spreads classes across Mon–Fri evenly.',
  });

  const assignments = [];
  const unassigned  = [];
  const dayLoad = createDayLoad();
  const traceLimit = Math.min(sorted.length, maxSectionsToTrace);

  for (let i = 0; i < sorted.length; i++) {
    const sec = sorted[i];
    const { result, combosChecked, rejectedReasons } = tryPlaceWithTrace(sec, rooms, assignments, {}, dayLoad);
    
    if (result) {
      assignments.push(result);
      recordLoad(dayLoad, result.slots);
      if (i < traceLimit) {
        addStep('PLACE_SUCCESS', {
          phase: 1,
          title: `✓ Placed: ${sec.courseCode} ${sec.sectionLabel || ''} (${sec.program || 'Elective'})`,
          description: `Section placed in ${result.roomName} on ${formatSlots(result.slots)}.`,
          section: {
            courseCode: sec.courseCode, courseTitle: sec.courseTitle,
            sectionLabel: sec.sectionLabel, program: sec.program,
            instructorName: sec.instructorName, creditHours: sec.creditHours,
            isLab: sec.isLab, enrollment: sec.enrollment || 40, yearLevel: sec.yearLevel,
          },
          assignment: {
            roomName: result.roomName, roomCapacity: result.roomCapacity,
            slots: result.slots, slotLabel: formatSlots(result.slots),
          },
          combosChecked,
          rejectedReasons: rejectedReasons.slice(-3),
          assignmentsCount: assignments.length,
          dayLoad: [...dayLoad],
          constraintsChecked: ['H1', 'H2', 'H3', 'H4', 'H5'],
          result: 'placed',
        });
      }
    } else {
      unassigned.push(sec);
      if (i < traceLimit) {
        addStep('PLACE_FAIL', {
          phase: 1,
          title: `✗ Failed: ${sec.courseCode} ${sec.sectionLabel || ''} (${sec.program || 'Elective'})`,
          description: `No valid (room, slot) found after checking ${combosChecked} combinations. Section queued for repair phases.`,
          section: {
            courseCode: sec.courseCode, courseTitle: sec.courseTitle,
            sectionLabel: sec.sectionLabel, program: sec.program,
            instructorName: sec.instructorName, creditHours: sec.creditHours,
            isLab: sec.isLab, enrollment: sec.enrollment || 40, yearLevel: sec.yearLevel,
          },
          combosChecked,
          rejectedReasons: rejectedReasons.slice(-5),
          assignmentsCount: assignments.length,
          result: 'unassigned',
        });
      }
    }
  }

  addStep('PHASE_END', {
    phase: 1,
    title: 'Phase 1 Complete',
    description: `Greedy construction finished. ${assignments.length} sections placed, ${unassigned.length} sections unassigned.`,
    placed: assignments.length,
    unassigned: unassigned.length,
    dayLoad: [...dayLoad],
    snapshot: assignments.slice(0, 20).map(a => ({
      courseCode: a.courseCode, sectionLabel: a.sectionLabel, program: a.program,
      roomName: a.roomName, slotLabel: formatSlots(a.slots),
    })),
  });

  // ── PHASE 2 ────────────────────────────────────────────────────────────
  addStep('PHASE_START', {
    phase: 2,
    title: 'Phase 2: Backtracking Swap Repair',
    description: `For each of the ${unassigned.length} unassigned sections, find a placed section that conflicts with it, temporarily remove it, place the unassigned section, then re-place the removed section elsewhere. If re-placement fails, undo the swap.`,
  });

  const still2 = [];
  for (let ui = 0; ui < unassigned.length; ui++) {
    const sec = unassigned[ui];
    const direct = tryPlaceWithTrace(sec, rooms, assignments, {}, dayLoad);
    if (direct.result) {
      assignments.push(direct.result);
      recordLoad(dayLoad, direct.result.slots);
      addStep('SWAP_DIRECT', {
        phase: 2,
        title: `✓ Direct Placement: ${sec.courseCode} ${sec.sectionLabel || ''}`,
        description: `Section placed without swap in ${direct.result.roomName} on ${formatSlots(direct.result.slots)}.`,
        section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel, program: sec.program, instructorName: sec.instructorName },
        assignment: { roomName: direct.result.roomName, slotLabel: formatSlots(direct.result.slots) },
        result: 'placed',
      });
      continue;
    }

    let placed = false;
    let swapAttempts = 0;
    for (let vi = 0; vi < assignments.length && !placed; vi++) {
      const victim = assignments[vi];
      if (!wouldBenefitSwap(sec, victim)) continue;
      swapAttempts++;

      const removed = assignments.splice(vi, 1)[0];
      unrecordLoad(dayLoad, removed.slots);
      const pU = tryPlaceWithTrace(sec, rooms, assignments, {}, dayLoad);

      if (pU.result) {
        assignments.push(pU.result);
        recordLoad(dayLoad, pU.result.slots);
        const pV = tryPlaceWithTrace(removed, rooms, assignments, {}, dayLoad);
        if (pV.result) {
          assignments.push(pV.result);
          recordLoad(dayLoad, pV.result.slots);
          placed = true;
          addStep('SWAP_SUCCESS', {
            phase: 2,
            title: `✓ Swap Success: ${sec.courseCode} ${sec.sectionLabel || ''}`,
            description: `Removed "${removed.courseCode} ${removed.sectionLabel || ''}" from ${removed.roomName}, placed target section, then re-placed the displaced section.`,
            section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel, program: sec.program },
            victim: { courseCode: removed.courseCode, sectionLabel: removed.sectionLabel, oldRoom: removed.roomName, oldSlot: formatSlots(removed.slots), newRoom: pV.result.roomName, newSlot: formatSlots(pV.result.slots) },
            assignment: { roomName: pU.result.roomName, slotLabel: formatSlots(pU.result.slots) },
            swapAttempts,
            result: 'placed',
          });
        } else {
          const idx = assignments.indexOf(pU.result);
          if (idx >= 0) assignments.splice(idx, 1);
          unrecordLoad(dayLoad, pU.result.slots);
          assignments.splice(vi, 0, removed);
          recordLoad(dayLoad, removed.slots);
          addStep('SWAP_UNDO', {
            phase: 2,
            title: `↩ Swap Undone for ${sec.courseCode}`,
            description: `Tried displacing "${removed.courseCode} ${removed.sectionLabel||''}" but it could not be re-placed. Swap reverted.`,
            section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel },
            victim: { courseCode: removed.courseCode, sectionLabel: removed.sectionLabel },
            result: 'undo',
          });
        }
      } else {
        assignments.splice(vi, 0, removed);
        recordLoad(dayLoad, removed.slots);
      }
    }

    if (!placed) {
      still2.push(sec);
      if (swapAttempts > 0) {
        addStep('SWAP_FAIL', {
          phase: 2,
          title: `✗ Swap Failed: ${sec.courseCode} ${sec.sectionLabel || ''}`,
          description: `Tried ${swapAttempts} swap(s) but none succeeded. Section remains unassigned.`,
          section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel, program: sec.program },
          swapAttempts,
          result: 'unassigned',
        });
      }
    }
  }

  addStep('PHASE_END', {
    phase: 2,
    title: 'Phase 2 Complete',
    description: `Swap repair finished. ${assignments.length} placed, ${still2.length} still unassigned.`,
    placed: assignments.length, unassigned: still2.length,
  });

  // ── PHASE 3 ────────────────────────────────────────────────────────────
  let currentUnassigned = still2;
  if (currentUnassigned.length > 0) {
    addStep('PHASE_START', {
      phase: 3,
      title: 'Phase 3: Relax H3 for Electives',
      description: `${currentUnassigned.length} sections remain. H3 (program-year conflict) is relaxed for elective courses — electives can overlap with other sections since students choose them individually.`,
    });
    const still3 = [];
    for (const sec of currentUnassigned) {
      const { result } = tryPlaceWithTrace(sec, rooms, assignments, { relaxH3Electives: true }, dayLoad);
      if (result) {
        assignments.push(result);
        recordLoad(dayLoad, result.slots);
        addStep('RELAX_PLACE', {
          phase: 3, title: `✓ Placed (H3 relaxed): ${sec.courseCode} ${sec.sectionLabel || ''}`,
          description: `Placed in ${result.roomName} on ${formatSlots(result.slots)} after relaxing H3 for electives.`,
          section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel, program: sec.program, isElective: sec.isElective },
          assignment: { roomName: result.roomName, slotLabel: formatSlots(result.slots) },
          relaxed: ['H3-electives'], result: 'placed',
        });
      } else still3.push(sec);
    }
    currentUnassigned = still3;
    addStep('PHASE_END', { phase: 3, title: 'Phase 3 Complete', placed: assignments.length, unassigned: currentUnassigned.length });
  }

  // ── PHASE 4 ────────────────────────────────────────────────────────────
  if (currentUnassigned.length > 0) {
    addStep('PHASE_START', {
      phase: 4,
      title: 'Phase 4: Relax H3 for Section Groups',
      description: `${currentUnassigned.length} sections remain. H3 further relaxed for different section groups (A vs B) — sections in different groups of the same program/year can overlap since students only attend one group.`,
    });
    const still4 = [];
    for (const sec of currentUnassigned) {
      const { result } = tryPlaceWithTrace(sec, rooms, assignments, { relaxH3Electives: true, relaxH3Groups: true }, dayLoad);
      if (result) {
        assignments.push(result);
        recordLoad(dayLoad, result.slots);
        addStep('RELAX_PLACE', {
          phase: 4, title: `✓ Placed (H3 groups relaxed): ${sec.courseCode} ${sec.sectionLabel || ''}`,
          section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel, sectionGroup: sec.sectionGroup },
          assignment: { roomName: result.roomName, slotLabel: formatSlots(result.slots) },
          relaxed: ['H3-electives', 'H3-groups'], result: 'placed',
        });
      } else still4.push(sec);
    }
    currentUnassigned = still4;
    addStep('PHASE_END', { phase: 4, title: 'Phase 4 Complete', placed: assignments.length, unassigned: currentUnassigned.length });
  }

  // ── PHASE 5 ────────────────────────────────────────────────────────────
  if (currentUnassigned.length > 0) {
    addStep('PHASE_START', {
      phase: 5,
      title: 'Phase 5: Soft Lab Placement (Skip H2)',
      description: `${currentUnassigned.length} sections remain. H2 (instructor uniqueness) is skipped — instructor conflicts are marked as TBD (To Be Determined) rather than hard violations. Used mainly for lab sections.`,
    });
    const still5 = [];
    for (const sec of currentUnassigned) {
      const { result } = tryPlaceWithTrace(sec, rooms, assignments, { skipH2: true, relaxH3Electives: true, relaxH3Groups: true, enforceGap: false }, dayLoad);
      if (result) {
        const n = result.instructorName || 'TBA';
        if (n !== 'TBA' && !n.endsWith('(TBD)')) result.instructorName = n + ' (TBD)';
        assignments.push(result);
        recordLoad(dayLoad, result.slots);
        addStep('RELAX_PLACE', {
          phase: 5, title: `⚠ Placed (TBD): ${sec.courseCode} ${sec.sectionLabel || ''}`,
          description: `Placed with instructor conflict marked TBD. Instructor: ${result.instructorName}`,
          section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel },
          assignment: { roomName: result.roomName, slotLabel: formatSlots(result.slots), instructorName: result.instructorName },
          relaxed: ['H2-skipped'], result: 'placed-tbd',
        });
      } else still5.push(sec);
    }
    currentUnassigned = still5;
    addStep('PHASE_END', { phase: 5, title: 'Phase 5 Complete', placed: assignments.length, unassigned: currentUnassigned.length });
  }

  // ── PHASE 6 ────────────────────────────────────────────────────────────
  if (currentUnassigned.length > 0) {
    addStep('PHASE_START', {
      phase: 6,
      title: 'Phase 6: Force Placement (Skip H2+H3)',
      description: `${currentUnassigned.length} sections remain. Last resort — both H2 and H3 are skipped. These assignments are marked FORCE and counted as hard violations but ensure every section gets a time slot.`,
    });
    const still6 = [];
    for (const sec of currentUnassigned) {
      const { result } = tryPlaceWithTrace(sec, rooms, assignments, { skipH2: true, skipH3: true, enforceGap: false }, dayLoad);
      if (result) {
        const n = (result.instructorName || 'TBA').replace(/ \(TBD\)$/, '');
        result.instructorName = n + ' (FORCE)';
        assignments.push(result);
        recordLoad(dayLoad, result.slots);
        addStep('RELAX_PLACE', {
          phase: 6, title: `⛔ Force Placed: ${sec.courseCode} ${sec.sectionLabel || ''}`,
          description: `Forced into ${result.roomName} on ${formatSlots(result.slots)}. May violate H2/H3. Marked FORCE.`,
          section: { courseCode: sec.courseCode, sectionLabel: sec.sectionLabel },
          assignment: { roomName: result.roomName, slotLabel: formatSlots(result.slots), instructorName: result.instructorName },
          relaxed: ['H2-skipped', 'H3-skipped'], result: 'forced',
        });
      } else still6.push(sec);
    }
    currentUnassigned = still6;
    addStep('PHASE_END', { phase: 6, title: 'Phase 6 Complete', placed: assignments.length, unassigned: currentUnassigned.length });
  }

  // ── Unscheduled fallback ────────────────────────────────────────────────
  for (const sec of currentUnassigned) {
    assignments.push({ ...makeProposed(sec, { name: 'UNSCHEDULED', capacity: 0 }, []), roomCapacity: 0 });
  }

  // ── Count hard violations ───────────────────────────────────────────────
  let hardViolations = 0;
  const scheduled = assignments.filter(a => a.roomName !== 'UNSCHEDULED');
  for (let i = 0; i < scheduled.length; i++) {
    const a = scheduled[i];
    for (let j = i + 1; j < scheduled.length; j++) {
      const b = scheduled[j];
      for (const as of a.slots) for (const bs of b.slots) {
        if (as.day !== bs.day || !slotsOverlap(as.hour, bs.hour)) continue;
        if (a.roomName === b.roomName) hardViolations++;
        const aI = a.instructorName || ''; const bI = b.instructorName || '';
        if (aI && bI && aI !== 'TBA' && bI !== 'TBA' &&
            !aI.endsWith('(TBD)') && !bI.endsWith('(TBD)') &&
            !aI.endsWith('(FORCE)') && !bI.endsWith('(FORCE)') && aI === bI) hardViolations++;
        if (!a.program || !b.program || !programsOverlap(a.program, b.program)) continue;
        if (a.courseCode && b.courseCode && a.courseCode === b.courseCode) continue;
        const aY = a.yearLevel || 0; const bY = b.yearLevel || 0;
        if (aY > 0 && bY > 0 && aY !== bY) continue;
        if (a.isElective || b.isElective) continue;
        const aG = a.sectionGroup || ''; const bG = b.sectionGroup || '';
        if (aG && bG && aG !== bG) continue;
        if (aI.endsWith('(FORCE)') || bI.endsWith('(FORCE)')) continue;
        hardViolations++;
      }
    }
  }

  addStep('FINAL', {
    title: 'Scheduling Complete',
    description: `Algorithm finished. ${scheduled.length} of ${sections.length} sections scheduled. ${hardViolations} hard constraint violations remain.`,
    totalSections: sections.length,
    scheduled: scheduled.length,
    unscheduled: currentUnassigned.length,
    hardViolations,
    phaseBreakdown: {
      phase1: null, phase2: null, phase3: null, phase4: null, phase5: null, phase6: null,
    },
  });

  return { steps, finalAssignments: assignments, hardViolations, scheduled: scheduled.length };
}

export async function POST(request) {
  try {
    await connectDB();
    const rooms    = await Room.find({ isExcluded: false }).lean();
    let sections   = await Section.find({}).lean();

    if (sections.length === 0) {
      return Response.json({ error: 'No sections found. Run the seed script first.' }, { status: 400 });
    }

    // Limit for performance: trace first N sections in detail
    const { traceLimit = 60 } = await request.json().catch(() => ({}));

    const { steps, finalAssignments, hardViolations, scheduled } = runTracedScheduler(sections, rooms, traceLimit);

    return Response.json({ steps, finalAssignments, hardViolations, scheduled, total: sections.length, rooms });
  } catch (error) {
    console.error('Simulate POST Error:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
