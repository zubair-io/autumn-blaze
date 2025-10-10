import mongoose from "mongoose";
import { Paper, IPaper } from "../models/paper.model";
import { Tag } from "../models/tag";
import { CollectibleRegistry } from "../models/collectible-registry";
import { HttpError } from "../utils/error";

export class PaperService {
  /**
   * Check if user has access to a paper through tags
   */
  private static async checkPaperAccess(
    paperId: string,
    userId: string,
    requiredAccess: "read" | "write" = "read",
  ): Promise<IPaper> {
    const paper = await Paper.findById(paperId).populate("tags");

    if (!paper) {
      throw new HttpError("Paper not found", 404);
    }

    // Owner has full access
    if (paper.createdBy === userId) {
      return paper;
    }

    // Check access through tags
    const tagIds = paper.tags.map((tag) =>
      typeof tag === "string" ? tag : tag._id.toString(),
    );

    // For access control, check if user has access to ANY of the tags
    const accessibleTags = await Tag.find({
      _id: { $in: tagIds },
      "sharing.sharedWith": {
        $elemMatch: {
          userId,
          // For write access, require write permission
          ...(requiredAccess === "write" ? { accessLevel: "write" } : {}),
        },
      },
    });

    if (accessibleTags.length === 0) {
      throw new HttpError("Access denied", 403);
    }

    return paper;
  }

  /**
   * List all papers for a user with given tag
   */
  static async listPapersByTag(
    userId: string,
    tagId: string,
    type?: string,
  ): Promise<IPaper[]> {
    // First check if user has access to the tag
    const tag = await Tag.findOne({
      _id: tagId,
      $or: [
        { createdBy: userId },
        { "sharing.sharedWith": { $elemMatch: { userId } } },
      ],
    });

    if (!tag) {
      throw new HttpError("Tag not found or access denied", 404);
    }

    // Build query
    const query: any = { tags: tagId };
    if (type) {
      query.type = type;
    }

    // Find papers with this tag
    // We only need to check if the paper has the tag since access is controlled by the tag
    const papers = await Paper.find(query).populate("tags");

    return papers;
  }

  /**
   * List all papers for a user
   */
  static async listUserPapers(
    userId: string,
    type?: string,
  ): Promise<IPaper[]> {
    // Build query
    const baseQuery: any = { createdBy: userId };
    if (type) {
      baseQuery.type = type;
    }

    // Find papers created by user
    const ownedPapers = await Paper.find(baseQuery).populate("tags");

    // Find accessible tags
    const accessibleTags = await Tag.find({
      "sharing.sharedWith": { $elemMatch: { userId } },
    });

    // Find papers with accessible tags
    const tagIds = accessibleTags.map((tag) => tag._id);

    if (tagIds.length === 0) {
      return ownedPapers;
    }

    const sharedQuery: any = {
      tags: { $in: tagIds },
      createdBy: { $ne: userId }, // Don't include papers the user already owns
    };
    if (type) {
      sharedQuery.type = type;
    }

    const sharedPapers = await Paper.find(sharedQuery).populate("tags");

    // Combine and remove duplicates
    const allPaperIds = new Set(ownedPapers.map((p) => p._id.toString()));
    const result = [...ownedPapers];

    for (const paper of sharedPapers) {
      if (!allPaperIds.has(paper._id.toString())) {
        result.push(paper);
        allPaperIds.add(paper._id.toString());
      }
    }

    return result;
  }

  /**
   * Get a single paper by ID
   */
  static async getPaper(paperId: string, userId: string): Promise<IPaper> {
    return await this.checkPaperAccess(paperId, userId);
  }

  /**
   * Create a new paper
   */
  static async createPaper(
    userId: string,
    data: { tags: string[]; type: string; data?: any },
  ): Promise<IPaper> {
    // Validate a single tag is provided
    if (!data.tags || !data.tags.length) {
      throw new HttpError("A tag is required", 400);
    }

    // Validate type is provided
    if (!data.type) {
      throw new HttpError("Type is required", 400);
    }

    // For now, just use the first tag
    const tagId = data.tags[0];

    // Validate tag exists and user has access
    const tag = await Tag.findOne({
      _id: tagId,
      $or: [
        { createdBy: userId },
        {
          "sharing.sharedWith": {
            $elemMatch: { userId, accessLevel: "write" },
          },
        },
      ],
    });

    if (!tag) {
      throw new HttpError("Tag not found or access denied", 404);
    }

    // Create the paper
    const paper = new Paper({
      tags: [tagId],
      type: data.type,
      data: data.data || {},
      createdBy: userId,
    });

    await paper.save();

    // Return the populated paper
    return await Paper.findById(paper._id).populate("tags");
  }

  /**
   * Update a paper
   */
  static async updatePaper(
    paperId: string,
    userId: string,
    updates: Partial<IPaper>,
  ): Promise<IPaper> {
    // Check access
    const paper = await this.checkPaperAccess(paperId, userId, "write");

    // Don't allow updating createdBy
    delete updates.createdBy;

    // Update the paper
    Object.assign(paper, updates);
    await paper.save();

    // Return the updated paper
    return await Paper.findById(paper._id).populate("tags");
  }

  /**
   * Delete a paper
   */
  static async deletePaper(
    paperId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    // Check access - must be owner to delete
    const paper = await Paper.findById(paperId);

    if (!paper) {
      throw new HttpError("Paper not found", 404);
    }

    if (paper.createdBy !== userId) {
      throw new HttpError("Only the owner can delete a paper", 403);
    }

    await Paper.deleteOne({ _id: paperId });

    return { success: true };
  }

  // Sharing functionality removed as access is controlled by tags
}
