import { Collection, ICollectionDocument } from "../models/collectible";
import { Tag } from "../models/tag";
import { ICollection, ICollectionPopulated, ITag } from "../types/collection";
import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";

export class CollectableService {
  private static instance: CollectableService;

  private constructor() {}

  static async getInstance(): Promise<CollectableService> {
    if (!CollectableService.instance) {
      CollectableService.instance = new CollectableService();
    }
    return CollectableService.instance;
  }

  async createCollectible(
    userId: string,
    input: ICollectionPopulated,
  ): Promise<ICollectionPopulated | any> {
    const query = { userId, itemId: input.itemId };
    const collection = await Collection.findOneAndUpdate(
      query,
      {
        ...input,
        userId,
      },
      {
        upsert: true,
        new: true,
        lean: true,
      },
    );
    return collection;
  }

  async updateCollectionTags(
    itemId: string,
    userId: string,
    tags: ITag[],
  ): Promise<ICollectionDocument | null> {
    // Get tag IDs and verify they exist
    const tagIds = tags.map((tag) => tag._id);

    // Verify all tags exist and user has WRITE access
    const validTags = await Tag.find({
      _id: { $in: tagIds },
      "sharing.sharedWith": {
        $elemMatch: {
          userId: userId,
          accessLevel: "write", // Only write access can add tags
        },
      },
    });
    console.log(validTags, tagIds);

    // If not all tags were found with write access, throw error
    // if (validTags.length !== tagIds.length) {
    //   throw new Error(
    //     "Some tags are invalid or user doesn't have write access",
    //   );
    // }

    // Update collection with verified tag IDs
    const updatedCollection = await Collection.findOneAndUpdate(
      {
        _id: itemId,
        userId: userId,
      },
      {
        $set: {
          tags: validTags.map((tag) => tag._id),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedCollection) {
      throw new Error("Collection not found or user doesn't have access");
    }

    return updatedCollection;
  }

  async deleteCollectible(userId: string, itemId: string): Promise<any> {
    const result = await Collection.deleteOne({
      _id: itemId,
      userId: userId, // Ensure user owns the item
    });

    if (result.deletedCount === 0) {
      return {
        status: 404,
        jsonBody: {
          error: "Item not found or you don't have permission to delete it",
        },
      };
    }

    return {
      status: 200,
      jsonBody: { message: "Item deleted successfully" },
    };
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
    })
      .populate("tags")
      .populate("registryData");
  }
}
