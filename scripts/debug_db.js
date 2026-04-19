const mongoose = require('mongoose');
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/timetable');
  
  const Section = mongoose.model('Section', new mongoose.Schema({}, {strict: false}));
  const Room = mongoose.model('Room', new mongoose.Schema({}, {strict: false}));
  
  const totalSections = await Section.countDocuments();
  const totalRooms = await Room.countDocuments();
  const excludedRooms = await Room.countDocuments({isExcluded: true});
  
  console.log('Total sections in DB:', totalSections);
  console.log('Total rooms:', totalRooms, 'Excluded:', excludedRooms, 'Available:', totalRooms - excludedRooms);
  
  // Check yearLevel distribution
  const yearStats = await Section.aggregate([
    { $group: { _id: '$yearLevel', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  console.log('\nYear level distribution:');
  yearStats.forEach(y => console.log('  Year', y._id, ':', y.count, 'sections'));
  
  // Check instructor TBA
  const tba = await Section.countDocuments({instructorName: 'TBA'});
  console.log('\nTBA instructors:', tba);
  
  // Check sections with no program
  const noProg = await Section.countDocuments({ $or: [{program: null}, {program: ''}] });
  console.log('Sections with no program:', noProg);
  
  // Find the most overloaded instructors
  const instrLoad = await Section.aggregate([
    { $match: { instructorName: { $ne: 'TBA' } } },
    { $group: { _id: '$instructorName', count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
    { $sort: { totalCH: -1 } },
    { $limit: 15 }
  ]);
  console.log('\nTop 15 most loaded instructors (by total CH):');
  instrLoad.forEach(i => console.log(' ', i._id, ':', i.count, 'sections,', i.totalCH, 'CH'));
  
  // Programs with most CH
  const progLoad = await Section.aggregate([
    { $match: { program: { $ne: null } } },
    { $group: { _id: '$program', count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
    { $sort: { totalCH: -1 } },
    { $limit: 20 }
  ]);
  console.log('\nTop 20 programs by total CH:');
  progLoad.forEach(p => console.log(' ', p._id, ':', p.count, 'sections,', p.totalCH, 'CH/week'));
  
  // Show how many sections share same year+program combo
  const yrProg = await Section.aggregate([
    { $match: { program: { $ne: null } } },
    { $group: { _id: { yearLevel: '$yearLevel', program: '$program' }, count: { $sum: 1 }, totalCH: { $sum: '$creditHours' } } },
    { $sort: { totalCH: -1 } },
    { $limit: 25 }
  ]);
  console.log('\nTop 25 year+program combos by total CH (these share the same conflict space):');
  yrProg.forEach(p => console.log(' ', `Year ${p._id.yearLevel} ${p._id.program}`, ':', p.count, 'sections,', p.totalCH, 'CH'));
  
  // Max available slots per program+year = 8 slots × 5 days = 40 per week
  console.log('\nMax available single-hour slots per week: 40 (8 per day × 5 days)');
  const overloaded = yrProg.filter(p => p.totalCH > 40);
  if (overloaded.length) {
    console.log('OVERLOADED COMBOS (need > 40 slots but only 40 exist):');
    overloaded.forEach(p => console.log('  !!', `Year ${p._id.yearLevel} ${p._id.program}`, ':', p.totalCH, 'CH'));
  }
  
  await mongoose.disconnect();
}
main();
