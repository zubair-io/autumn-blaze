import mongoose, { Document, Schema } from "mongoose";

export interface CollectibleRegistry {
  upc?: string;
  title: string;
  description: any;
  images: string[];
  providerId: string;
  provider: string;
  providerData?: any; // Since it's Mixed type, using any. Could be more specific based on your needs
  createdAt?: Date; // From timestamps: true
  updatedAt?: Date; // From timestamps: true
  tags: { type: string; value: string }[];
}

export interface ICollectibleRegistryDocument
  extends CollectibleRegistry,
    Document {}

const CollectibleRegistrySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: {
      type: String,
      required: true,
      get: (value: string) => JSON.parse(value),
      set: (value: object) => JSON.stringify(value),
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    providerId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      index: true,
    },
    upc: {
      type: String,
      required: false,
      index: true,
    },
    tags: [
      {
        _id: false,
        type: {
          type: String,
          enum: ["folder", "itemType", "genre", "custom", "system"],
          required: true,
        },
        value: { type: String, required: true },
      },
    ],
    providerData: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: false },
    toObject: { getters: true, virtuals: false },
  },
);

export const CollectibleRegistry = mongoose.model<ICollectibleRegistryDocument>(
  "CollectibleRegistry",
  CollectibleRegistrySchema,
);
