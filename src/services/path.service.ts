import { Path, IPath, IPathWithPopulatedTags } from "../models/path";
import { Types } from "mongoose";
import { Tag } from "../models/tag";
import { ITag } from "../types/collection";

export class PathService {
  private static instance: PathService;

  private constructor() {}

  static async getInstance(): Promise<PathService> {
    if (!PathService.instance) {
      PathService.instance = new PathService();
    }
    return PathService.instance;
  }

  /**
   * List all paths for a given user ID
   * @param userId - The ID of the user
   * @returns Promise<IPath[]> Array of paths
   */
  async list(userId: string): Promise<IPath[]> {
    try {
      const paths = await Path.find({ userId })
        .populate("tags")
        .sort({ created: -1 });
      return paths;
    } catch (error) {
      console.error("Error fetching paths:", error);
      throw new Error("Failed to fetch paths");
    }
  }

  /**
   * List all paths that have a specific tag
   * @param tagId - The ID of the tag
   * @param userId - Optional user ID to filter by user
   * @returns Promise<IPath[]> Array of paths with the specified tag
   */
  async listByTag(tagId: string, userId?: string): Promise<IPath[]> {
    try {
      const tag = await Tag.findOne({
        _id: tagId,
        "sharing.sharedWith": {
          $elemMatch: {
            userId,
            accessLevel: "write",
          },
        },
      });
      if (!tag) {
        throw new Error("Not authorized to modify this tag");
      }
      const query: any = { tags: new Types.ObjectId(tagId) };

      // Add userId to query if provided
      if (userId) {
        query.userId = userId;
      }

      const paths = await Path.find(query)
        .populate("tags")
        .sort({ created: -1 });
      return paths;
    } catch (error) {
      console.error("Error fetching paths by tag:", error);
      throw new Error("Failed to fetch paths by tag");
    }
  }

  /**
   * Save a single path or an array of paths
   * @param pathData - Single path or array of paths to save
   * @param userId - The ID of the user creating the paths
   * @returns Promise<IPath | IPath[]> Saved path(s)
   */
  async add(
    pathData: Partial<IPath> | Partial<IPath>[],
    userId: string,
  ): Promise<IPathWithPopulatedTags | IPathWithPopulatedTags[]> {
    try {
      // Helper function to validate tags
      async function validateTags(tags: string[]): Promise<ITag[]> {
        if (!tags || tags.length === 0) return [];

        const validTags = (await Tag.find({
          _id: { $in: tags },
          "sharing.sharedWith": {
            $elemMatch: {
              userId,
              accessLevel: { $in: ["read", "write"] },
            },
          },
        })) as ITag[];

        if (validTags.length !== tags.length) {
          throw new Error("One or more tags are invalid or not accessible");
        }

        return validTags;
      }

      // Handle single path
      if (!Array.isArray(pathData)) {
        const { _id, ...cleanPathData } = pathData;

        const validatedTags = await validateTags(cleanPathData.tags);

        const path = new Path({
          ...cleanPathData,
          tags: validatedTags.map((tag) => tag._id),
          userId,
          created: new Date(),
        });

        const savedPath = await path.save();
        return {
          ...(savedPath.toObject() as Omit<IPath, "tags">),
          tags: validatedTags,
        } as IPathWithPopulatedTags;
      }

      // Handle array of paths
      const pathsWithValidTags = await Promise.all(
        pathData.map(async (data) => {
          const { _id, ...cleanData } = data;
          const validatedTags = await validateTags(cleanData.tags);

          return {
            pathData: new Path({
              ...cleanData,
              tags: validatedTags.map((tag) => tag._id),
              userId,
              created: new Date(),
            }),
            fullTags: validatedTags,
          };
        }),
      );

      const savedPaths = await Path.insertMany(
        pathsWithValidTags.map((p) => p.pathData),
      );

      return savedPaths.map((path, index) => ({
        ...(path.toObject() as Omit<IPath, "tags">),
        tags: pathsWithValidTags[index].fullTags,
      })) as IPathWithPopulatedTags[];
    } catch (error) {
      console.error("Error saving path(s):", error);
      throw new Error("Failed to save path(s): " + error.message);
    }
  }

  /**
   * Delete a single path
   * @param pathId - The ID of the path to delete
   * @param userId - The ID of the user (for authorization)
   * @returns Promise<void>
   */
  async deletePath(pathId: string, userId: string): Promise<void> {
    try {
      const result = await Path.deleteOne({
        _id: new Types.ObjectId(pathId),
        userId,
      });

      if (result.deletedCount === 0) {
        throw new Error("Path not found or unauthorized");
      }
    } catch (error) {
      console.error("Error deleting path:", error);
      throw new Error("Failed to delete path");
    }
  }
}
