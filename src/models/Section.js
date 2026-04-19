import mongoose from 'mongoose';

const SectionSchema = new mongoose.Schema({
  courseCode:   { type: String, required: true },
  courseTitle:  { type: String, required: true },
  creditHours:  { type: Number, required: true },
  sectionLabel: { type: String },          // A, B, G1 …
  program:      { type: String },          // BAI, BCS …
  instructorName: { type: String },        // raw name (TBA if missing)
  isLab:        { type: Boolean, default: false },
  isElective:   { type: Boolean, default: false }, // true if title contains "Elective" or program is null
  sectionGroup: { type: String, default: '' },  // first letter of sectionLabel: A, B, C … for group awareness
  enrollment:   { type: Number, default: 40 },
  yearLevel:    { type: Number, default: 0 }, // academic year: 1–4, inferred from course code first digit
});

export default mongoose.models.Section || mongoose.model('Section', SectionSchema);
