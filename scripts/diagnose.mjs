/**
 * Diagnostic script: runs scheduler and prints detailed violation info.
 * Run: node --experimental-modules scripts/diagnose.mjs
 */

import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb://localhost:27017/timetable_scheduler';

// Inline models
const SectionSchema = new mongoose.Schema({
  courseCode: String, courseTitle: String, creditHours: Number,
  sectionLabel: String, program: String, instructorName: String,
  isLab: Boolean, isElective: Boolean, sectionGroup: String,
  enrollment: Number, yearLevel: Number,
});
const RoomSchema = new mongoose.Schema({
  name: String, capacity: Number, faculty: String, allocation: String,
  isLab: Boolean, isExcluded: Boolean,
});

const Section = mongoose.models.Section || mongoose.model('Section', SectionSchema);
const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);

  const rooms = await Room.find({ isExcluded: false }).lean();
  const sections = await Section.find({}).lean();

  console.log(`Loaded ${sections.length} sections, ${rooms.length} rooms\n`);

  // Import scheduler (ESM)
  const schedulerPath = new URL('../src/lib/scheduler.js', import.meta.url).href;
  const { runScheduler, countHardViolations } = await import(schedulerPath);

  const { assignments, unassigned, hardViolations } = runScheduler(sections, rooms);

  // Print unscheduled
  const unscheduledList = assignments.filter(a => a.roomName === 'UNSCHEDULED');
  console.log(`\n--- UNSCHEDULED (${unscheduledList.length}) ---`);
  for (const u of unscheduledList) {
    console.log(`  ${u.courseCode} ${u.sectionLabel || ''} | ${u.program || 'null'} | yr${u.yearLevel} | CH${u.creditHours} | lab=${u.isLab} | elec=${u.isElective} | grp=${u.sectionGroup} | instr=${u.instructorName}`);
  }

  // Detailed violations
  const scheduled = assignments.filter(a => a.roomName !== 'UNSCHEDULED');
  console.log(`\n--- DETAILED VIOLATIONS ---`);
  const DAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  let vCount = 0;

  for (let i = 0; i < scheduled.length; i++) {
    const a = scheduled[i];
    for (let j = i + 1; j < scheduled.length; j++) {
      const b = scheduled[j];
      for (const as of a.slots) {
        for (const bs of b.slots) {
          if (as.day !== bs.day || as.hour !== bs.hour) continue;

          // H1
          if (a.roomName === b.roomName) {
            vCount++;
            console.log(`  H1 ROOM: ${a.roomName} ${DAY_NAME[as.day]} h${as.hour}`);
            console.log(`    A: ${a.courseCode} ${a.sectionLabel} [${a.program}] yr${a.yearLevel}`);
            console.log(`    B: ${b.courseCode} ${b.sectionLabel} [${b.program}] yr${b.yearLevel}`);
          }

          // H2
          const aI = a.instructorName || '';
          const bI = b.instructorName || '';
          if (aI && bI && aI !== 'TBA' && bI !== 'TBA' &&
              !aI.endsWith('(TBD)') && !bI.endsWith('(TBD)') &&
              !aI.endsWith('(FORCE)') && !bI.endsWith('(FORCE)') &&
              aI === bI) {
            vCount++;
            console.log(`  H2 INSTRUCTOR: ${aI} ${DAY_NAME[as.day]} h${as.hour}`);
            console.log(`    A: ${a.courseCode} ${a.sectionLabel} [${a.program}] yr${a.yearLevel} room=${a.roomName}`);
            console.log(`    B: ${b.courseCode} ${b.sectionLabel} [${b.program}] yr${b.yearLevel} room=${b.roomName}`);
          }

          // H3 (same logic as countHardViolations)
          if (a.courseCode && b.courseCode && a.courseCode === b.courseCode) continue;
          if (!a.program || !b.program) continue;
          
          // Check program overlap
          function splitP(p) { return p ? p.split(/[+,]/).map(s => s.trim()).filter(Boolean) : []; }
          function overlap(p1, p2) { const s = new Set(splitP(p2)); return splitP(p1).some(x => s.has(x)); }
          if (!overlap(a.program, b.program)) continue;
          
          const aY = a.yearLevel || 0;
          const bY = b.yearLevel || 0;
          if (aY > 0 && bY > 0 && aY !== bY) continue;
          if (a.isElective || b.isElective) continue;
          const aG = a.sectionGroup || '';
          const bG = b.sectionGroup || '';
          if (aG && bG && aG !== bG) continue;
          if (aI.endsWith('(FORCE)') || bI.endsWith('(FORCE)')) continue;

          vCount++;
          console.log(`  H3 PROGRAM: ${a.program} vs ${b.program} yr${aY}|${bY} ${DAY_NAME[as.day]} h${as.hour}`);
          console.log(`    A: ${a.courseCode} ${a.sectionLabel} grp=${aG} elec=${a.isElective} room=${a.roomName}`);
          console.log(`    B: ${b.courseCode} ${b.sectionLabel} grp=${bG} elec=${b.isElective} room=${b.roomName}`);
        }
      }
    }
  }

  console.log(`\nTotal violations found: ${vCount} (reported: ${hardViolations})`);

  // Phase 5/6 stats
  const tbdCount = scheduled.filter(a => (a.instructorName || '').endsWith('(TBD)')).length;
  const forceCount = scheduled.filter(a => (a.instructorName || '').endsWith('(FORCE)')).length;
  console.log(`TBD assignments: ${tbdCount}, FORCE assignments: ${forceCount}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
