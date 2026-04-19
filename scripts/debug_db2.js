const mongoose = require('mongoose');
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/timetable');
  const db = mongoose.connection.db;
  
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  ${col.name}: ${count} documents`);
    if (count > 0 && count < 5) {
      const docs = await db.collection(col.name).find().toArray();
      docs.forEach(d => console.log('    ', JSON.stringify(d).slice(0, 200)));
    } else if (count > 0) {
      const sample = await db.collection(col.name).find().limit(2).toArray();
      sample.forEach(d => console.log('    ', JSON.stringify(d).slice(0, 200)));
    }
  }
  
  // Query sections collection directly
  const sections = db.collection('sections');
  const sCount = await sections.countDocuments();
  console.log('\n=== SECTIONS ===');
  console.log('Total:', sCount);
  
  if (sCount > 0) {
    // Year level distribution
    const yearStats = await sections.aggregate([
      { $group: { _id: '$yearLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    console.log('Year levels:', yearStats);
    
    // TBA count
    const tba = await sections.countDocuments({instructorName: 'TBA'});
    console.log('TBA instructors:', tba);
    
    // No program
    const noProg = await sections.countDocuments({ $or: [{program: null}, {program: ''}] });
    console.log('No program:', noProg);
    
    // Top loaded instructors
    const instrLoad = await sections.aggregate([
      { $match: { instructorName: { $ne: 'TBA' } } },
      { $group: { _id: '$instructorName', count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
      { $sort: { totalCH: -1 } },
      { $limit: 15 }
    ]).toArray();
    console.log('\nTop 15 loaded instructors:');
    instrLoad.forEach(i => console.log(' ', i._id, ':', i.count, 'sections,', i.totalCH, 'CH'));
    
    // Year+Program combos
    const yrProg = await sections.aggregate([
      { $match: { program: { $ne: null } } },
      { $group: { _id: { yr: '$yearLevel', prog: '$program' }, count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
      { $sort: { totalCH: -1 } },
      { $limit: 30 }
    ]).toArray();
    console.log('\nTop 30 year+program combos by CH:');
    yrProg.forEach(p => console.log(' ', `Yr${p._id.yr} ${p._id.prog}`, ':', p.count, 'sec,', p.totalCH, 'CH'));
    
    console.log('\nMax slots/week: 40. Programs needing >40 are IMPOSSIBLE:');
    yrProg.filter(p => p.totalCH > 40).forEach(p => 
      console.log('  !! Yr'+p._id.yr, p._id.prog, ':', p.totalCH, 'CH > 40 slots'));
    
    // Composite programs - check for overlap
    const allProgs = await sections.distinct('program');
    console.log('\nAll unique program strings (' + allProgs.length + '):');
    allProgs.forEach(p => console.log(' ', JSON.stringify(p)));
  }
  
  // Rooms
  const rooms = db.collection('rooms');
  const rCount = await rooms.countDocuments();
  console.log('\n=== ROOMS ===');
  console.log('Total:', rCount);
  const excluded = await rooms.countDocuments({isExcluded: true});
  console.log('Excluded:', excluded, 'Available:', rCount - excluded);
  
  await mongoose.disconnect();
}
main();
