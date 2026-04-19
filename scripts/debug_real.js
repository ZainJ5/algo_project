const mongoose = require('mongoose');
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/timetable_scheduler');
  const db = mongoose.connection.db;
  const sections = db.collection('sections');
  const rooms = db.collection('rooms');

  // 1. Basics
  const sCount = await sections.countDocuments();
  const rCount = await rooms.countDocuments();
  const excluded = await rooms.countDocuments({isExcluded: true});
  console.log(`Sections: ${sCount}, Rooms: ${rCount} (${excluded} excluded, ${rCount - excluded} available)`);

  // 2. Year level distribution
  const yearStats = await sections.aggregate([
    { $group: { _id: '$yearLevel', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log('\nYear levels:', yearStats.map(y => `yr${y._id}=${y.count}`).join(', '));

  // 3. TBA and no-program
  const tba = await sections.countDocuments({instructorName: 'TBA'});
  const noProg = await sections.countDocuments({ $or: [{program: null}, {program: ''}] });
  console.log(`TBA instructors: ${tba}, No program: ${noProg}`);

  // 4. Top loaded instructors (by total weekly CH)
  const instrLoad = await sections.aggregate([
    { $match: { instructorName: { $ne: 'TBA' } } },
    { $group: { _id: '$instructorName', count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
    { $sort: { totalCH: -1 } },
    { $limit: 20 }
  ]).toArray();
  console.log('\nTop 20 loaded instructors:');
  instrLoad.forEach(i => console.log(`  ${i._id}: ${i.count} sections, ${i.totalCH} CH/week (slots needed: ${i.totalCH})`));
  
  // Max available slots for any single instructor: 40 (5 days × 8 slots)
  const overloadedInstr = instrLoad.filter(i => i.totalCH > 40);
  if (overloadedInstr.length) {
    console.log('\n!! IMPOSSIBLE: Instructors needing > 40 slots/week:');
    overloadedInstr.forEach(i => console.log(`  ${i._id}: needs ${i.totalCH} slots, max is 40`));
  }

  // 5. Year+Program combos — find which will cause H3 problems
  const yrProg = await sections.aggregate([
    { $match: { program: { $ne: null }, program: { $ne: '' } } },
    { $group: { _id: { yr: '$yearLevel', prog: '$program' }, count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
    { $sort: { totalCH: -1 } },
    { $limit: 30 }
  ]).toArray();
  console.log('\nTop 30 year+program combos by CH:');
  yrProg.forEach(p => {
    const flag = p.totalCH > 40 ? ' !! OVER 40 !!' : '';
    console.log(`  Yr${p._id.yr} ${p._id.prog}: ${p.count} sections, ${p.totalCH} CH${flag}`);
  });

  // 6. Check program overlap effects
  // Programs like "BAI+BCE+BCS" contain 3 programs, so they conflict with all three.
  // We need to figure out the effective load per atomic program per year level.
  const allSections = await sections.find({}).toArray();
  const atomicLoad = {}; // key: `yr_program` => total CH
  for (const s of allSections) {
    if (!s.program) continue;
    const progs = s.program.split(/[+,]/).map(p => p.trim()).filter(Boolean);
    for (const prog of progs) {
      const key = `yr${s.yearLevel || 0}_${prog}`;
      atomicLoad[key] = (atomicLoad[key] || 0) + s.creditHours;
    }
  }
  const loadEntries = Object.entries(atomicLoad).sort((a, b) => b[1] - a[1]);
  console.log('\nTop 30 atomic program+year loads (EFFECTIVE after splitting composites):');
  loadEntries.slice(0, 30).forEach(([key, ch]) => {
    const flag = ch > 40 ? ' !! OVER 40 — IMPOSSIBLE !!' : (ch > 32 ? ' ⚠ TIGHT' : '');
    console.log(`  ${key}: ${ch} CH${flag}`);
  });

  // 7. Check last saved timetable for violations detail
  const timetables = db.collection('timetables');
  const lastTT = await timetables.find().sort({createdAt: -1}).limit(1).toArray();
  if (lastTT.length) {
    const tt = lastTT[0];
    const as = tt.assignments;
    const scheduled = as.filter(a => a.roomName !== 'UNSCHEDULED');
    const unscheduled = as.filter(a => a.roomName === 'UNSCHEDULED');
    console.log(`\nLast timetable: ${scheduled.length} scheduled, ${unscheduled.length} unscheduled, ${tt.hardViolations} violations`);
    
    if (unscheduled.length > 0) {
      console.log('\nUnscheduled sections:');
      unscheduled.forEach(u => console.log(`  ${u.courseCode} ${u.courseTitle} sec:${u.sectionLabel} prog:${u.program} instr:${u.instructorName} CH:${u.creditHours} lab:${u.isLab}`));
    }
    
    // Recount violations and identify them
    let violations = [];
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];
        for (const as2 of a.slots) {
          for (const bs of b.slots) {
            if (as2.day !== bs.day || as2.hour !== bs.hour) continue;
            
            if (a.roomName === b.roomName) {
              violations.push(`H1 ROOM: ${a.roomName} at day${as2.day} hr${as2.hour}: ${a.courseCode}/${a.sectionLabel} vs ${b.courseCode}/${b.sectionLabel}`);
            }
            if (a.instructorName && a.instructorName !== 'TBA' && b.instructorName !== 'TBA' && a.instructorName === b.instructorName) {
              violations.push(`H2 INSTR: ${a.instructorName} at day${as2.day} hr${as2.hour}: ${a.courseCode}/${a.sectionLabel} vs ${b.courseCode}/${b.sectionLabel}`);
            }
            // H3 check
            if (a.program && b.program && a.courseCode !== b.courseCode) {
              const s1 = new Set(a.program.split(/[+,]/).map(p => p.trim()).filter(Boolean));
              const s2 = new Set(b.program.split(/[+,]/).map(p => p.trim()).filter(Boolean));
              let overlap = false;
              for (const p of s1) if (s2.has(p)) { overlap = true; break; }
              const yrMatch = (!a.yearLevel || !b.yearLevel) ? true : a.yearLevel === b.yearLevel;
              if (overlap && yrMatch) {
                violations.push(`H3 PROG: ${a.program}(yr${a.yearLevel}) vs ${b.program}(yr${b.yearLevel}) at day${as2.day} hr${as2.hour}: ${a.courseCode}/${a.sectionLabel} vs ${b.courseCode}/${b.sectionLabel}`);
              }
            }
          }
        }
      }
    }
    console.log(`\nDetailed violations (${violations.length}):`);
    violations.forEach(v => console.log(`  ${v}`));
  }

  await mongoose.disconnect();
}
main();
