import connectDB  from '@/lib/mongodb';
import Timetable from '@/models/Timetable';

// GET /api/timetable          → list all timetables (metadata only)
// GET /api/timetable?id=xxx   → full timetable detail
// GET /api/timetable?id=xxx&program=BAI  → filter by program
// GET /api/timetable?id=xxx&instructor=Dr. XYZ
// GET /api/timetable?id=xxx&room=CS LH1

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id          = searchParams.get('id');
    const program     = searchParams.get('program');
    const instructor  = searchParams.get('instructor');
    const room        = searchParams.get('room');

    if (!id) {
      // List all timetables (no assignments array to keep response small)
      const list = await Timetable.find({})
        .select('-assignments')
        .sort({ generatedAt: -1 })
        .lean();
      return Response.json(list);
    }

    const doc = await Timetable.findById(id).lean();
    if (!doc) {
      return Response.json({ error: 'Timetable not found' }, { status: 404 });
    }

    let { assignments } = doc;

    if (program)    assignments = assignments.filter(a => a.program && a.program.includes(program));
    if (instructor) assignments = assignments.filter(a => a.instructorName === instructor);
    if (room)       assignments = assignments.filter(a => a.roomName === room);

    return Response.json({ ...doc, assignments });
  } catch (err) {
    console.error('GET /api/timetable error:', err);
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
