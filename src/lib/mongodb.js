import mongoose from "mongoose";


const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    await mongoose.connect(mongoURI);
    console.log("Connected to Database");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error connecting to Database:", error.message);
    } else {
      console.error("Unknown error occurred while connecting to the Database");
    }
  }
};

export default connectDB;