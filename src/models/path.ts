import mongoose, { Schema, Document } from "mongoose";
import { ITag } from "../types/collection";

// Interface for Bounds (assuming it exists in your system)
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Interface for Point (assuming it's a simple x,y coordinate)
interface Point {
  x: number;
  y: number;
}

// Interface extending Document for TypeScript type safety
export interface IPath extends Document {
  points: Point[];
  widths: number[];
  style: string;
  x: number;
  y: number;
  scale: number;
  thickness: number;
  id: number;
  bounds?: Bounds;
  _id: string;
  tags: string[];
}
export interface IPathWithPopulatedTags extends Omit<IPath, "tags"> {
  tags: ITag[]; // Instead of tag IDs, this has full tag objects
}

// Define the Point Schema
const PointSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
});

// Update Bounds interface to match the actual data structure
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Update BoundsSchema to match the actual data structure
const BoundsSchema = new Schema({
  minX: { type: Number, required: true },
  maxX: { type: Number, required: true },
  minY: { type: Number, required: true },
  maxY: { type: Number, required: true },
});

// Define the main Path Schema
const PathSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["path"],
      default: "path",
    },
    points: {
      type: [PointSchema],
      required: true,
      default: [],
    },
    widths: {
      type: [Number],
      required: true,
      default: [],
    },
    style: {
      type: String,
      required: true,
    },
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
    scale: {
      type: Number,
      required: true,
    },
    thickness: {
      type: Number,
      required: true,
    },

    bounds: {
      type: BoundsSchema,
      required: false,
    },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    created: { type: Date, default: Date.now },
    userId: { type: String, required: true },
  },
  {
    // This will ensure virtual getters are included in JSON output
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Create and export the model
export const Path = mongoose.model<IPath>("Path", PathSchema);
