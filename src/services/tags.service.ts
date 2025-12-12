import { Tag, ITagDocument } from "../models/tag";

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

  /**
   * Get or create the user's recordings tag
   * Each user has their own recordings folder tag
   */
  async getOrCreateRecordingsTag(userId: string): Promise<ITagDocument> {
    // Try to find user's existing recordings tag
    let tag = await Tag.findOne({
      type: "folder",
      value: "recordings",
      "sharing.sharedWith": {
        $elemMatch: {
          userId: userId,
          accessLevel: "write",
        },
      },
    });

    if (!tag) {
      // Create the user's recordings tag
      const newTag = new Tag({
        type: "folder",
        value: "recordings",
        label: "Recordings",
        sharing: {
          sharedWith: [
            {
              userId: userId,
              accessLevel: "write",
            },
          ],
          isPublic: false,
        },
      });
      return await newTag.save();
    }

    return tag;
  }

  /**
   * Get or create the user's documents tag
   * Each user has their own documents folder tag
   */
  async getOrCreateDocumentsTag(userId: string): Promise<ITagDocument> {
    let tag = await Tag.findOne({
      type: "folder",
      value: "documents",
      "sharing.sharedWith": {
        $elemMatch: {
          userId: userId,
          accessLevel: "write",
        },
      },
    });

    if (!tag) {
      const newTag = new Tag({
        type: "folder",
        value: "documents",
        label: "Documents",
        sharing: {
          sharedWith: [
            {
              userId: userId,
              accessLevel: "write",
            },
          ],
          isPublic: false,
        },
      });
      return await newTag.save();
    }

    return tag;
  }
}
