import mongoose, { Document, Schema } from "mongoose";
import { ITag } from "../types/tag";

export interface ITagDocument extends ITag, Document {}

const TagSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["folder", "itemType", "genre", "custom"],
      required: true,
    },
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
    shardKey: { "sharing.sharedWith.userId": 1 }, // This is the shard key configuration
  }
);

TagSchema.index({
  "sharing.sharedWith.userId": 1,
  "sharing.sharedWith.accessLevel": 1,
});

export const Tag = mongoose.model<ITagDocument>("Tag", TagSchema);
