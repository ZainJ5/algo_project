import mongoose from "mongoose";

let cached = global.__mongooseConn;

const connectDB = async () => {
  // Reuse existing connection
  if (cached && mongoose.connection.readyState === 1) return;

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    throw new Error("MONGODB_URI not found in environment variables");
  }

  try {
    await mongoose.connect(mongoURI);
    cached = mongoose.connection;
    global.__mongooseConn = cached;
    console.log("Connected to Database");
  } catch (error) {
    console.error("Error connecting to Database:", error.message || error);
    throw error; // let the caller handle it
  }
};

export default connectDB;