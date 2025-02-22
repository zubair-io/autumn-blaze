import { Tag } from "../models/tag";

import { AddUserToTagParams, ITag, ITagSharing } from "../types/tag";

export class TagService {
  private static instance: TagService;

  private constructor() {}

  static async getInstance(): Promise<TagService> {
    if (!TagService.instance) {
      TagService.instance = new TagService();
    }
    return TagService.instance;
  }

  async updateTag(
    id: string,
    patch: Partial<ITag>,
    sub: string,
  ): Promise<ITag | null> {
    const sanitizedPatch = {
      ...(patch.type && { type: patch.type }),
      ...(patch.value && { value: patch.value }),
    };

    const updatedTag = await Tag.findOneAndUpdate(
      {
        _id: id,
        "sharing.sharedWith": {
          $elemMatch: {
            userId: sub,
            accessLevel: "write",
          },
        },
      },
      { $set: sanitizedPatch },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedTag) {
      throw new Error("Tag not found or user does not have write access");
    }

    return updatedTag;
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
    const savedTag = await newTag.save();
    return [savedTag];
  }
  async createTag(userId: string, tag): Promise<ITag> {
    const sharing: ITagSharing = {
      sharedWith: [
        {
          userId: userId,
          accessLevel: "write",
        },
      ],
      isPublic: false,
    };
    const sanitizedTag: ITag = {
      ...(tag.type && { type: tag.type }),
      ...(tag.value && { value: tag.value }),
      sharing,
    };
    const newTag = new Tag(sanitizedTag);
    const savedTag = await newTag.save();
    return savedTag;
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
      if (existingTags && existingTags.length > 0) {
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
      "sharing.sharedWith": {
        $elemMatch: {
          userId: requestingUserId,
          accessLevel: "write",
        },
      },
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
      },
    );
  }
}
