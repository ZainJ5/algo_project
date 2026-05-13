import connectDB from '@/lib/mongodb';
import Section from '@/models/Section';

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    
    // Validate required fields
    if (!body.courseCode || !body.courseTitle || !body.creditHours) {
      return Response.json({ error: 'courseCode, courseTitle, and creditHours are required' }, { status: 400 });
    }

    const newSection = await Section.create({
      courseCode: body.courseCode,
      courseTitle: body.courseTitle,
      creditHours: Number(body.creditHours),
      sectionLabel: body.sectionLabel || '',
      program: body.program || '',
      instructorName: body.instructorName || 'TBA',
      isLab: Boolean(body.isLab),
      isElective: Boolean(body.isElective),
      sectionGroup: body.sectionGroup || '',
      enrollment: Number(body.enrollment) || 40,
      yearLevel: Number(body.yearLevel) || 0,
    });

    return Response.json({ message: 'Section added successfully', section: newSection });
  } catch (error) {
    console.error('Add Section POST Error:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
