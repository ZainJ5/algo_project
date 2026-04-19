import connectDB  from '@/lib/mongodb';
import Room from '@/models/Room';
import Section from '@/models/Section';
import Timetable from '@/models/Timetable';
import { runScheduler } from '@/lib/scheduler';

/**
 * POST /api/schedule
 * Runs the scheduling algorithm and saves result to MongoDB.
 * Optionally accepts { programFilter, instructorFilter } in body.
 */
export async function POST(request) {
  await connectDB();

  let body = {};
  try { body = await request.json(); } catch (_) { /* no body is fine */ }

  // Load data from DB
  const rooms    = await Room.find({ isExcluded: false }).lean();
  let   sections = await Section.find({}).lean();

  // Optional filters
  if (body.programFilter) {
    sections = sections.filter(s => s.program && s.program.includes(body.programFilter));
  }
  if (body.instructorFilter) {
    sections = sections.filter(s => s.instructorName === body.instructorFilter);
  }

  if (sections.length === 0) {
    return Response.json({ error: 'No sections found. Run the seed script first.' }, { status: 400 });
  }

  const { assignments, unassigned, hardViolations, softScore } = runScheduler(sections, rooms);

  // Save to DB
  const doc = await Timetable.create({
    status:         hardViolations === 0 ? 'complete' : 'complete',
    hardViolations,
    softScore,
    assignments,
  });

  return Response.json({
    timetableId:    doc._id,
    total:          sections.length,
    scheduled:      assignments.filter(a => a.roomName !== 'UNSCHEDULED').length,
    unscheduled:    unassigned.length,
    hardViolations,
    message:        hardViolations === 0
      ? 'Schedule generated with ZERO hard constraint violations.'
      : `Schedule generated. ${hardViolations} hard violations remain.`,
  });
}
