// src/lib/mongodb.ts
import mongoose from "mongoose";

let connectionInstance: typeof mongoose | null = null;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (connectionInstance) {
    return connectionInstance;
  }

  try {
    // Enable strict query and strict mode
    mongoose.set("strict", true);
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(process.env.DB_CONNECTION_STRING!, {
      // Connection options
      maxPoolSize: 10,
      minPoolSize: 5,
      retryReads: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    connectionInstance = conn;
    console.log("MongoDB Connected");

    // Handle connection errors
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
      connectionInstance = null;
    });

    return connectionInstance;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Optional: Function to close connection (useful for testing)
export async function disconnectFromDatabase(): Promise<void> {
  if (connectionInstance) {
    await mongoose.disconnect();
    connectionInstance = null;
  }
}
