import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb://localhost:27017/timetable_scheduler';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Clear old timetables
  const del = await db.collection('timetables').deleteMany({});
  console.log('Deleted timetables:', del.deletedCount);

  // Sample section
  const sample = await db.collection('sections').findOne({});
  console.log('Sample section:', JSON.stringify(sample, null, 2));

  // Elective count
  const electives = await db.collection('sections').countDocuments({ isElective: true });
  console.log('Elective sections:', electives);

  // Sections with group
  const withGroup = await db.collection('sections').countDocuments({ sectionGroup: { $ne: '' } });
  console.log('With sectionGroup:', withGroup);

  // Year distribution
  for (let y = 0; y <= 4; y++) {
    const c = await db.collection('sections').countDocuments({ yearLevel: y });
    console.log(`yr${y}:`, c);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
