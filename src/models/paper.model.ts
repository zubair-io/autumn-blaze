import mongoose, { Schema, Document, model } from "mongoose";
import { ITag } from "../types/tag";

export interface IPaper extends Document {
  tags: mongoose.Types.ObjectId[] | ITag[];
  type: "recording" | "collectible" | "note" | "document";
  data: any;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // user ID
}

const PaperSchema = new Schema<IPaper>(
  {
    tags: [
      {
        type: Schema.Types.ObjectId,
        ref: "Tag",
        required: true,
      },
    ],
    type: {
      type: String,
      enum: ["recording", "collectible", "note", "document"],
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Create indexes for better query performance
PaperSchema.index({ createdBy: 1 });
PaperSchema.index({ tags: 1 });

// Compound index for finding papers by tag and user
PaperSchema.index({ tags: 1, createdBy: 1 });

// Compound index for finding papers by type and tags
PaperSchema.index({ type: 1, tags: 1 });

// Additional indexes for recording queries
PaperSchema.index({ 'data.recordingId': 1, tags: 1 });
PaperSchema.index({ 'data.audioSyncStatus': 1, tags: 1, createdBy: 1 });

// Additional indexes for collectible queries
PaperSchema.index({ 'data.itemId': 1, createdBy: 1 });
PaperSchema.index({ 'data.provider': 1, type: 1 });

export const Paper =
  mongoose.models.Paper || model<IPaper>("Paper", PaperSchema);
