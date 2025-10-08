import mongoose, { Schema, Document } from 'mongoose';

export interface IRecording extends Document {
  recordingId: string;
  userId: string; // Auth0 sub (user ID)
  transcript: string;
  processedOutput: string;
  promptUsed: {
    triggerWord: string;
    promptText: string;
  };
  duration: number;
  timestamp: Date;
  audioUrl?: string;
  fileSize?: number;
  audioSyncStatus: 'pending' | 'uploaded' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const RecordingSchema = new Schema<IRecording>(
  {
    recordingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String, // Auth0 sub
      required: true,
      index: true,
    },
    transcript: {
      type: String,
      required: true,
      // @ts-ignore - MongoDB text search
      text: true,
    },
    processedOutput: {
      type: String,
      required: true,
    },
    promptUsed: {
      triggerWord: {
        type: String,
        required: true,
      },
      promptText: {
        type: String,
        required: true,
      },
    },
    duration: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    audioUrl: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    audioSyncStatus: {
      type: String,
      enum: ['pending', 'uploaded', 'failed'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
RecordingSchema.index({ userId: 1, timestamp: -1 });
RecordingSchema.index({ userId: 1, audioSyncStatus: 1 });

export const Recording = mongoose.model<IRecording>('Recording', RecordingSchema);
