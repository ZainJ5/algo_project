import mongoose from 'mongoose';

const InstructorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  normalizedName: { type: String },
});

export default mongoose.models.Instructor || mongoose.model('Instructor', InstructorSchema);
