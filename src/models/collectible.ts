import mongoose, { Document, Schema } from "mongoose";
import { ICollection } from "../types/collection";

export interface ICollectionDocument extends ICollection, Document {}

const CollectionSchema = new Schema(
  {
    itemId: { type: String, required: true },
    userId: { type: String, required: true },
    status: {
      type: String,
      enum: ["want", "have", "completed"],
      required: true,
    },
    quantity: { type: Number, required: true },
    created: { type: Date, default: Date.now },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  },
  {
    timestamps: true,
  }
);

export const Collection = mongoose.model<ICollectionDocument>(
  "Collectible",
  CollectionSchema
);
