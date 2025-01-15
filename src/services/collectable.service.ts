import { Collection, ICollectionDocument } from "../models/collectible";
import { Tag } from "../models/tag";
import { ICollection, ICollectionPopulated } from "../types/collection";
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
    const collection = await Collection.create({
      ...input,
      userId,
    });
    return collection.toJSON();
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
