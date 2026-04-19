/**
 * Seed script — reads both Excel files and populates MongoDB.
 * Run: node scripts/seed.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mongoose models (inline, no module aliases needed) ───────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/timetable_scheduler';

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  capacity: Number,
  faculty: String,
  allocation: String,
  isLab: { type: Boolean, default: false },
  isExcluded: { type: Boolean, default: false },
});

const InstructorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  normalizedName: String,
});

const SectionSchema = new mongoose.Schema({
  courseCode:     { type: String, required: true },
  courseTitle:    { type: String, required: true },
  creditHours:    { type: Number, required: true },
  sectionLabel:   String,
  program:        String,
  instructorName: String,
  isLab:          { type: Boolean, default: false },
  isElective:     { type: Boolean, default: false },
  sectionGroup:   { type: String, default: '' },
  enrollment:     { type: Number, default: 40 },
  yearLevel:      { type: Number, default: 0 },
});

const Room       = mongoose.models.Room       || mongoose.model('Room',       RoomSchema);
const Instructor = mongoose.models.Instructor || mongoose.model('Instructor', InstructorSchema);
const Section    = mongoose.models.Section    || mongoose.model('Section',    SectionSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize instructor name: remove trailing -1, -2, extra spaces, typos */
function normalizeName(raw) {
  if (!raw) return null;
  let n = String(raw).trim();
  // Remove section suffixes like -1, -2, (2-CH)
  n = n.replace(/-\d+(\s*\(\d+-CH\))?$/, '').trim();
  n = n.replace(/\s*\(\d+-CH\)$/, '').trim();
  // Multiple spaces → single
  n = n.replace(/\s+/g, ' ');
  // Fix "Dr ." → "Dr."
  n = n.replace(/Dr\s+\./g, 'Dr.');
  return n;
}

/** Canonical dedup map: map variant → canonical name */
const DEDUP = {
  'Dr .Usman Farooq':        'Dr. Usman Farooq',
  'Dr. M. Usman Farooq':     'Dr. Usman Farooq',
  'Dr. Hammad Amjad Khan':   'Dr. Hammad Khan',
  'Dr. Khurram Imran Khan':  'Dr. Khurram Imran',
  'Dr. Waleed Sethi':        'Dr. Waleed Tariq Sethi',
  'Dr. Attique-ur-Rehman':   'Dr. Attique Ur Rehman',
  'Mr. Ahmad Nawaz':         'Mr. Ahmed Nawaz',
  'Dr Omer Bin Saeed':       'Dr. Omer Bin Saeed',
  'Dr. Nisar Ahmed':         'Prof. Dr. Nisar Ahmed',
};

function canonicalName(raw) {
  if (!raw) return 'TBA';
  const skip = ['All Faculty Members', 'FCSE', 'FES', 'FME', 'By FES/FME'];
  if (skip.includes(raw.trim())) return 'TBA';
  const norm = normalizeName(raw);
  return DEDUP[norm] || norm;
}

function isLabSection(code, title) {
  if (!code || !title) return false;
  const t = String(title).toLowerCase();
  const c = String(code);
  return (
    t.includes('lab') ||
    c.endsWith('L') ||
    c.includes(' Lab') ||
    c.includes('L ') ||
    t.includes(' lab')
  );
}

/**
 * Detect elective courses from title keywords or null program.
 */
function isElectiveCourse(title, program) {
  if (!program) return true; // no specific program = open elective
  if (!title) return false;
  const t = String(title).toLowerCase();
  return t.includes('elective') || t.includes('senior design project') || t.includes('research project');
}

/**
 * Extract the section group letter from sectionLabel.
 * "A" → "A", "A1" → "A", "A2" → "A", "B1" → "B", "F+H" → "F", "G1" → "G"
 * Used so parallel sub-groups of different courses but same group letter are
 * treated as the same student cohort (must not conflict).
 * Different group letters (A vs B) are different student cohorts (can overlap).
 */
function extractSectionGroup(label) {
  if (!label) return '';
  const l = String(label).trim();
  if (!l) return '';
  // Take the first letter only
  const ch = l.charAt(0).toUpperCase();
  if (ch >= 'A' && ch <= 'Z') return ch;
  return '';
}

/**
 * Extract academic year level from course code.
 * Uses the first digit found in the code.
 * CS232 → 2, CV314 → 3, AI102 → 1, EE451 → 4
 * Returns 0 if no digit found or digit out of 1–4 range.
 */
function extractYearLevel(code) {
  if (!code) return 0;
  const c = String(code).split('/')[0].trim();
  const match = c.match(/\d/);
  if (!match) return 0;
  const yr = parseInt(match[0]);
  return (yr >= 1 && yr <= 4) ? yr : 0;
}

// ── Parse lecture halls ───────────────────────────────────────────────────────
function parseRooms() {
  const wb = XLSX.readFile(
    path.join(__dirname, '..', '..', 'Lecture Halls Appraisal.xlsx')
  );
  const ws = wb.Sheets['Lecture Halls Appraisal'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const rooms = [];
  let currentFaculty = null;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (row[0]) currentFaculty = String(row[0]).trim();
    const name     = row[1] ? String(row[1]).trim() : null;
    const capacity = row[2] ? Number(row[2])         : null;
    const alloc    = row[3] ? String(row[3]).trim()  : null;

    if (!name || !capacity) continue;

    // ES LH4 is quiz-only → excluded
    const isExcluded = name === 'ES LH4';

    rooms.push({
      name:       name,
      capacity:   capacity,
      faculty:    currentFaculty,
      allocation: alloc,
      isLab:      false,
      isExcluded: isExcluded,
    });
  }
  return rooms;
}

// ── Parse courses ─────────────────────────────────────────────────────────────
function parseSections() {
  const wb = XLSX.readFile(
    path.join(__dirname, '..', '..', 'List of Offered Courses Spring 2025.xlsx')
  );
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const sections = [];
  for (let i = 1; i < rows.length; i++) {
    const [code, title, ch, section, forProg, instructor] = rows[i];
    if (!code || !ch) continue;

    sections.push({
      courseCode:     String(code).trim(),
      courseTitle:    String(title || '').trim(),
      creditHours:    Number(ch),
      sectionLabel:   section ? String(section).trim() : null,
      program:        forProg  ? String(forProg).trim()  : null,
      instructorName: canonicalName(instructor),
      isLab:          isLabSection(code, title),
      isElective:     isElectiveCourse(title, forProg),
      sectionGroup:   extractSectionGroup(section),
      enrollment:     40,  // default; actual data not available
      yearLevel:      extractYearLevel(code),
    });
  }
  return sections;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);

  // Clear existing data
  await Room.deleteMany({});
  await Instructor.deleteMany({});
  await Section.deleteMany({});

  // Rooms
  const roomData = parseRooms();
  await Room.insertMany(roomData);
  console.log(`✓ Inserted ${roomData.length} rooms`);

  // Sections
  const sectionData = parseSections();
  await Section.insertMany(sectionData);
  console.log(`✓ Inserted ${sectionData.length} sections`);

  // Instructors — deduplicated unique names
  const instrNames = new Set(sectionData.map(s => s.instructorName).filter(n => n && n !== 'TBA'));
  const instructorDocs = [...instrNames].map(n => ({ name: n, normalizedName: n }));
  await Instructor.insertMany(instructorDocs);
  console.log(`✓ Inserted ${instructorDocs.length} unique instructors`);

  await mongoose.disconnect();
  console.log('\nSeeding complete!');
}

seed().catch(err => { console.error(err); process.exit(1); });
