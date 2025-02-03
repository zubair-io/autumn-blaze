import mongoose, { Document, Schema } from "mongoose";
import { ITag } from "../types/tag";

export interface ITagDocument extends ITag, Document {}

const TagSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["folder", "itemType", "genre", "custom", "system"],
      required: true,
    },
    label: { type: String, required: false },
    value: { type: String, required: true },
    sharing: {
      sharedWith: [
        {
          _id: false,
          userId: { type: String, required: true },
          accessLevel: {
            type: String,
            enum: ["read", "write"],
            required: true,
          },
        },
      ],
      isPublic: { type: Boolean, default: false },
      _id: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Tag = mongoose.model<ITagDocument>("Tag", TagSchema);
