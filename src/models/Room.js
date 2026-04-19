import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  capacity: { type: Number, required: true },
  faculty: { type: String },
  allocation: { type: String },
  isLab: { type: Boolean, default: false },
  isExcluded: { type: Boolean, default: false }, // e.g., ES LH4 (quiz only)
});

export default mongoose.models.Room || mongoose.model('Room', RoomSchema);
