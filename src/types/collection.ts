// src/types/collection.ts
import { Types } from "mongoose";

export interface ITagSharing {
  sharedWith: [
    {
      userId: { type: String; required: true };
      accessLevel: { type: String; enum: ["read", "write"]; required: true };
    },
  ];
  isPublic?: boolean;
}

export interface ITag {
  type: "folder" | "itemType" | "genre" | "custom";
  value: string;
  sharing?: ITagSharing;
  _id: string;
}

export interface ICollection {
  itemId: string;
  userId: string;
  status: "want" | "have" | "completed";
  quantity: number;
  created?: Date;
  tags: Types.ObjectId[]; // Reference to Tag documents
}

export interface ICollectionPopulated extends Omit<ICollection, "tags"> {
  _id: string;
  tags: (ITag & { _id: string })[];
}
