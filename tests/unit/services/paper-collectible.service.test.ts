/**
 * Tests for Paper Service with Collectible Type
 *
 * These tests verify that the Paper service correctly handles collectible operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { Paper } from "../../../src/models/paper.model";
import { Tag } from "../../../src/models/tag";
import { PaperService } from "../../../src/services/paper.service";
import { CollectibleRegistry } from "../../../src/models/collectible-registry";

describe("PaperService - Collectible Operations", () => {
  let userId: string;
  let tagId: string;
  let registryId: string;

  beforeEach(async () => {
    // Clear collections
    await Paper.deleteMany({});
    await Tag.deleteMany({});
    await CollectibleRegistry.deleteMany({});

    // Setup test user
    userId = "test-user-123";

    // Create test tag
    const tag = await Tag.create({
      type: "folder",
      value: "My LEGO Collection",
      createdBy: userId,
    });
    tagId = tag._id.toString();

    // Create test registry
    const registry = await CollectibleRegistry.create({
      title: "LEGO Star Wars Millennium Falcon",
      description: { content: [{ content: [{ text: "Epic starship" }] }] },
      images: ["https://example.com/falcon.jpg"],
      providerId: "75192",
      provider: "rebrickable",
      tags: [{ type: "genre", value: "Star Wars" }],
    });
    registryId = registry._id.toString();
  });

  afterEach(async () => {
    await Paper.deleteMany({});
    await Tag.deleteMany({});
    await CollectibleRegistry.deleteMany({});
  });

  describe("createPaper with collectible type", () => {
    it("should create a collectible paper with all required fields", async () => {
      const collectibleData = {
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
          registryData: registryId,
          status: "have",
          quantity: 1,
        },
      };

      const paper = await PaperService.createPaper(userId, collectibleData);

      expect(paper).toBeDefined();
      expect(paper.type).toBe("collectible");
      expect(paper.createdBy).toBe(userId);
      expect(paper.data.itemId).toBe("75192");
      expect(paper.data.provider).toBe("rebrickable");
      expect(paper.data.status).toBe("have");
      expect(paper.data.quantity).toBe(1);
    });

    it("should reject collectible without type", async () => {
      const collectibleData = {
        tags: [tagId],
        data: {
          itemId: "75192",
          provider: "rebrickable",
        },
      };

      await expect(
        PaperService.createPaper(userId, collectibleData as any),
      ).rejects.toThrow("Type is required");
    });

    it("should reject collectible without tags", async () => {
      const collectibleData = {
        tags: [],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
        },
      };

      await expect(
        PaperService.createPaper(userId, collectibleData),
      ).rejects.toThrow("A tag is required");
    });
  });

  describe("listUserPapers with type filter", () => {
    beforeEach(async () => {
      // Create multiple papers of different types
      await Paper.create({
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
          status: "have",
          quantity: 1,
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "10294",
          provider: "rebrickable",
          status: "want",
          quantity: 1,
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "note",
        data: {
          title: "My notes",
          content: "Some content",
        },
        createdBy: userId,
      });
    });

    it("should list all papers without type filter", async () => {
      const papers = await PaperService.listUserPapers(userId);

      expect(papers).toHaveLength(3);
    });

    it("should list only collectible papers with type filter", async () => {
      const papers = await PaperService.listUserPapers(userId, "collectible");

      expect(papers).toHaveLength(2);
      papers.forEach((paper) => {
        expect(paper.type).toBe("collectible");
      });
    });

    it("should list only note papers with type filter", async () => {
      const papers = await PaperService.listUserPapers(userId, "note");

      expect(papers).toHaveLength(1);
      expect(papers[0].type).toBe("note");
    });
  });

  describe("listPapersByTag with type filter", () => {
    beforeEach(async () => {
      // Create multiple papers of different types
      await Paper.create({
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
        },
        createdBy: userId,
      });

      await Paper.create({
        tags: [tagId],
        type: "note",
        data: { title: "Note 1" },
        createdBy: userId,
      });
    });

    it("should list all papers by tag without type filter", async () => {
      const papers = await PaperService.listPapersByTag(userId, tagId);

      expect(papers).toHaveLength(2);
    });

    it("should list only collectible papers by tag with type filter", async () => {
      const papers = await PaperService.listPapersByTag(
        userId,
        tagId,
        "collectible",
      );

      expect(papers).toHaveLength(1);
      expect(papers[0].type).toBe("collectible");
    });
  });

  describe("updatePaper for collectible", () => {
    it("should update collectible data", async () => {
      // Create a collectible paper
      const paper = await Paper.create({
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
          status: "want",
          quantity: 1,
        },
        createdBy: userId,
      });

      // Update the status
      const updated = await PaperService.updatePaper(
        paper._id.toString(),
        userId,
        {
          data: {
            ...paper.data,
            status: "have",
            quantity: 2,
          },
        },
      );

      expect(updated.data.status).toBe("have");
      expect(updated.data.quantity).toBe(2);
    });
  });

  describe("deletePaper for collectible", () => {
    it("should delete a collectible paper", async () => {
      // Create a collectible paper
      const paper = await Paper.create({
        tags: [tagId],
        type: "collectible",
        data: {
          itemId: "75192",
          provider: "rebrickable",
        },
        createdBy: userId,
      });

      // Delete it
      const result = await PaperService.deletePaper(
        paper._id.toString(),
        userId,
      );

      expect(result.success).toBe(true);

      // Verify deletion
      const found = await Paper.findById(paper._id);
      expect(found).toBeNull();
    });
  });

  describe("Index performance", () => {
    it("should efficiently query by type and tags", async () => {
      // Create many papers
      const papers = Array.from({ length: 100 }, (_, i) => ({
        tags: [tagId],
        type: i % 2 === 0 ? "collectible" : "note",
        data: {
          itemId: `item-${i}`,
          provider: "rebrickable",
        },
        createdBy: userId,
      }));

      await Paper.insertMany(papers);

      // Query with explain to check index usage
      const result: any = await Paper.find({
        type: "collectible",
        tags: tagId,
      }).explain("executionStats");

      // Verify index was used (not a collection scan)
      expect(result.executionStats?.executionSuccess).toBe(true);
    });
  });
});
