import mongoose from "mongoose";

// Cache the connection across hot-reloads in Next.js dev mode and across
// multiple concurrent API requests.  Without caching, every request calls
// mongoose.connect() again, exhausting the connection pool and causing
// Mongoose's command-buffering to time out (the "buffering timed out after
// 10000ms" error).
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
  // Return the existing connection immediately if available.
  if (cached.conn) return cached.conn;

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    throw new Error('MONGODB_URI not found in environment variables');
  }

  // Kick off a single connection attempt and share the promise so concurrent
  // requests don't each create their own connection.
  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoURI, {
      // Don't buffer Mongoose operations when not yet connected — fail fast
      // so callers get a clear error instead of a cryptic 10-second timeout.
      bufferCommands: false,
      serverSelectionTimeoutMS: 30_000,
      socketTimeoutMS:          45_000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next request can retry.
    cached.promise = null;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('MongoDB connection error:', msg);
    throw err;
  }

  console.log('Connected to Database');
  return cached.conn;
};

export default connectDB;