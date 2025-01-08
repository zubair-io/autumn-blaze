export interface ITagSharing {
  sharedWith: {
    userId: string;
    accessLevel: "read" | "write";
  }[];
  isPublic?: boolean;
}

export interface ITag {
  type: "folder" | "itemType" | "genre" | "custom";
  value: string;
  sharing: ITagSharing;
}

export interface AddUserToTagParams {
  collectionId: string;
  tagId: string;
  targetUserId: string;
  accessLevel: "read" | "write";
  requestingUserId: string;
}
