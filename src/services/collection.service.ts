import { Collection, ICollectionDocument } from "../models/collectible";
import { Tag } from "../models/tag";
import { ICollection, ICollectionPopulated } from "../types/collection";
import { ITag } from "../types/tag";

export class CollectibleService {
  private static instance: CollectibleService;

  private constructor() {}

  static async getInstance(): Promise<CollectibleService> {
    if (!CollectibleService.instance) {
      CollectibleService.instance = new CollectibleService();
    }
    return CollectibleService.instance;
  }

  async createCollectible(
    userId: string,
    input: ICollectionPopulated
  ): Promise<ICollectionPopulated | any> {
    const createdTags = await Promise.all(
      input.tags.map((tagInput) =>
        Tag.create({
          ...tagInput,
          sharing: {
            ...tagInput.sharing,
            sharedWith: [{ userId, accessLevel: "write" }],
          },
        })
      )
    );

    try {
      // Create all tags first

      // Create collection with tag references
      const collection = await Collection.create({
        ...input,
        userId,
        tags: createdTags.map((tag) => tag._id),
      });

      // Return populated version
      const tags = createdTags.map((tag) => tag.toObject()) as (ITag & {
        _id: string;
      })[];
      return {
        ...collection.toObject(),
        tags,
      };
    } catch (error) {
      console.error("Creation failed:", error);
      // If creation fails, attempt to clean up any tags that were created
      // Note: This is a best-effort cleanup
      const tagIds = createdTags?.map((tag) => tag._id);
      if (tagIds?.length) {
        await Tag.deleteMany({ _id: { $in: tagIds } }).catch((err) =>
          console.error("Cleanup failed:", err)
        );
      }
      throw error;
    }
  }

  async listUserCollectible(userId: string): Promise<ICollection[]> {
    return Collection.find({
      $or: [
        { userId },
        {
          tags: {
            $in: await Tag.find({
              "sharing.sharedWith": {
                $elemMatch: {
                  userId,
                  accessLevel: { $in: ["read", "write"] },
                },
              },
            }).distinct("_id"),
          },
        },
      ],
    }).populate("tags");
  }
}
