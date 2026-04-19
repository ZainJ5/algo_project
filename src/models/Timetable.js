import mongoose from 'mongoose';

// One document = the complete generated timetable (array of assignments)
const AssignmentSchema = new mongoose.Schema({
  sectionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  courseCode:   String,
  courseTitle:  String,
  sectionLabel: String,
  program:      String,
  instructorName: String,
  isLab:        Boolean,
  creditHours:  Number,
  yearLevel:    { type: Number, default: 0 },
  enrollment:   { type: Number, default: 40 },
  sectionGroup: String, // "A", "B" — inferred from sectionLabel prefix
  isElective:   { type: Boolean, default: false },
  // Each slot: { day: 0-4, hour: 0-7 }
  slots: [{ day: Number, hour: Number }],
  roomName:     String,
  roomCapacity: Number,
});

const TimetableSchema = new mongoose.Schema({
  generatedAt:  { type: Date, default: Date.now },
  status:       { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  hardViolations: { type: Number, default: 0 },
  softScore:    { type: Number, default: 0 },
  assignments:  [AssignmentSchema],
});

export default mongoose.models.Timetable || mongoose.model('Timetable', TimetableSchema);
