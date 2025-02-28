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

  async getById(
    pathId: string,
    userId: string,
  ): Promise<IPathWithPopulatedTags | null> {
    try {
      // Find path by ID with permission check through tags only
      const [path] = await Path.aggregate([
        // Match the specific path ID
        { $match: { _id: new Types.ObjectId(pathId) } },
        // Look up the tags associated with the path
        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "tagObjects",
          },
        },
        // Filter to include only if at least one tag gives the user access
        {
          $match: {
            "tagObjects.sharing.sharedWith": {
              $elemMatch: {
                userId: userId,
                accessLevel: { $in: ["read", "write"] },
              },
            },
          },
        },
      ]);

      if (!path) {
        return null; // Path not found or user doesn't have access
      }

      // Populate the tags properly
      return (await Path.populate(path, {
        path: "tags",
      })) as unknown as IPathWithPopulatedTags;
    } catch (error) {
      console.error("Error fetching path by ID:", error);
      throw new Error("Failed to fetch path");
    }
  }

  /**
   * List all paths for a given user ID
   * @param userId - The ID of the user
   * @returns Promise<IPath[]> Array of paths
   */
  async list(userId: string): Promise<IPath[]> {
    try {
      // Use a single aggregation pipeline to find all accessible paths
      const paths = await Path.aggregate([
        // Look up the tags associated with each path
        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "tagObjects",
          },
        },
        // Filter to include only paths where:
        // 1. The user is the owner, OR
        // 2. At least one tag gives the user access
        {
          $match: {
            $or: [
              { userId: userId },
              {
                "tagObjects.sharing.sharedWith": {
                  $elemMatch: {
                    userId: userId,
                    accessLevel: { $in: ["read", "write"] },
                  },
                },
              },
            ],
          },
        },
        // Sort by creation date descending
        { $sort: { created: -1 } },
      ]);

      // Need to populate the tags properly after aggregation
      return Path.populate(paths, { path: "tags" });
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
  //   | IPathWithPopulatedTags[]
  async add(
    pathData: Partial<IPath>, //| Partial<IPath>[],
    userId: string,
  ): Promise<IPathWithPopulatedTags> {
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
      //if (!Array.isArray(pathData)) {
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
      //  }

      //   // Handle array of paths
      //   const pathsWithValidTags = await Promise.all(
      //     pathData.map(async (data) => {
      //       const { _id, ...cleanData } = data;
      //       const validatedTags = await validateTags(cleanData.tags);

      //       return {
      //         pathData: new Path({
      //           ...cleanData,
      //           tags: validatedTags.map((tag) => tag._id),
      //           userId,
      //           created: new Date(),
      //         }),
      //         fullTags: validatedTags,
      //       };
      //     }),
      //   );

      //   const savedPaths = await Path.insertMany(
      //     pathsWithValidTags.map((p) => p.pathData),
      //   );

      //   return savedPaths.map((path, index) => ({
      //     ...(path.toObject() as Omit<IPath, "tags">),
      //     tags: pathsWithValidTags[index].fullTags,
      //   })) as IPathWithPopulatedTags[];
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
      // Find paths that have at least one tag giving the user write access
      const [pathWithWriteAccess] = await Path.aggregate([
        // Match the specific path ID
        { $match: { _id: new Types.ObjectId(pathId) } },
        // Look up associated tags
        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "accessTags",
          },
        },
        // Check if user has access through tags only
        {
          $match: {
            "accessTags.sharing.sharedWith": {
              $elemMatch: {
                userId: userId,
                accessLevel: "write", // Only write access allows deletion
              },
            },
          },
        },
        // Return the ID if found
        { $project: { _id: 1 } },
      ]);

      // If no path was found with proper permissions
      if (!pathWithWriteAccess) {
        throw new Error("Path not found or unauthorized");
      }

      // Use the ID we retrieved from the database for deletion
      const verifiedPathId = pathWithWriteAccess._id;

      // Proceed with deletion using the verified ID
      const result = await Path.deleteOne({ _id: verifiedPathId });

      if (result.deletedCount === 0) {
        throw new Error("Path could not be deleted");
      }
    } catch (error) {
      console.error("Error deleting path:", error);
      throw error instanceof Error ? error : new Error("Failed to delete path");
    }
  }
}
