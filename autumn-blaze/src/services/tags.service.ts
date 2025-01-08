import { Tag } from "../models/tag";

import { AddUserToTagParams, ITag } from "../types/tag";

export class TagService {
  private static instance: TagService;

  private constructor() {}

  static async getInstance(): Promise<TagService> {
    if (!TagService.instance) {
      TagService.instance = new TagService();
    }
    return TagService.instance;
  }

  async createDefaultTag(userId: string): Promise<ITag[]> {
    const defaultTag: ITag = {
      type: "folder",
      value: "Lego",
      sharing: {
        sharedWith: [
          {
            userId: userId,
            accessLevel: "write",
          },
        ],
        isPublic: false,
      },
    };

    const newTag = new Tag(defaultTag);
    await newTag.save();
    return [defaultTag];
  }

  async listUserTags(userId: string): Promise<ITag[]> {
    try {
      const existingTags = await Tag.find({
        "sharing.sharedWith": {
          $elemMatch: {
            userId,
            accessLevel: { $in: ["read", "write"] },
          },
        },
      });
      console.log({ existingTags });
      if (existingTags && existingTags.length > 0) {
        console.log({ existingTags });
        return existingTags;
      }

      return await this.createDefaultTag(userId);
    } catch (error) {
      console.error("Error in listUserTags:", error);
      throw new Error("Failed to retrieve user tags");
    }
  }
  async addUserToTag({
    tagId,
    targetUserId,
    accessLevel,
    requestingUserId,
  }: Omit<AddUserToTagParams, "collectionId">): Promise<ITag | null> {
    // Verify requesting user has write access to the tag
    const tag = await Tag.findOne({
      _id: tagId,
      $or: [
        {
          "sharing.sharedWith": {
            $elemMatch: {
              userId: requestingUserId,
              accessLevel: "write",
            },
          },
        },
      ],
    });

    if (!tag) {
      throw new Error("Not authorized to modify this tag");
    }

    return Tag.findByIdAndUpdate(
      tagId,
      {
        $push: {
          "sharing.sharedWith": {
            userId: targetUserId,
            accessLevel,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );
  }
}
