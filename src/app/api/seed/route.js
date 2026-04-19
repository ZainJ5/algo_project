import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import Section from '@/models/Section';
import Instructor from '@/models/Instructor';

// GET /api/seed  → returns counts of seeded data
export async function GET() {
  await connectDB();
  const [rooms, sections, instructors] = await Promise.all([
    Room.countDocuments(),
    Section.countDocuments(),
    Instructor.countDocuments(),
  ]);
  return Response.json({ rooms, sections, instructors });
}
