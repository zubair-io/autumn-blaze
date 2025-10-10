/**
 * Integration Tests for Collectible → Paper Migration
 *
 * Tests the complete migration process and validates data integrity
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { Collection } from "../../src/models/collectible";
import { Paper } from "../../src/models/paper.model";
import { Tag } from "../../src/models/tag";
import { CollectibleRegistry } from "../../src/models/collectible-registry";
import {
  migrateCollectiblesToPaper,
  validateMigration,
} from "../../src/scripts/migrate-collectibles-to-paper";

describe("Collectible to Paper Migration", () => {
  let testUserId: string;
  let testTagId: string;
  let testRegistryId: string;

  beforeAll(async () => {
    // Setup test data
    testUserId = "migration-test-user";

    // Create test tag
    const tag = await Tag.create({
      type: "folder",
      value: "Test Collection",
      createdBy: testUserId,
    });
    testTagId = tag._id.toString();

    // Create test registry
    const registry = await CollectibleRegistry.create({
      title: "Test Item",
      description: { content: [] },
      images: ["https://example.com/test.jpg"],
      providerId: "test-123",
      provider: "rebrickable",
      tags: [],
    });
    testRegistryId = registry._id.toString();

    // Clear any existing test data
    await Collection.deleteMany({ userId: testUserId });
    await Paper.deleteMany({ createdBy: testUserId });
  });

  afterAll(async () => {
    // Cleanup
    await Collection.deleteMany({ userId: testUserId });
    await Paper.deleteMany({ createdBy: testUserId });
    await Tag.deleteMany({ createdBy: testUserId });
    await CollectibleRegistry.deleteMany({ providerId: "test-123" });
  });

  describe("Before Migration", () => {
    it("should have collectibles in Collectible collection", async () => {
      // Create test collectibles
      await Collection.create({
        itemId: "test-item-1",
        userId: testUserId,
        provider: "rebrickable",
        registryData: testRegistryId,
        status: "have",
        quantity: 1,
        tags: [testTagId],
      });

      await Collection.create({
        itemId: "test-item-2",
        userId: testUserId,
        provider: "rebrickable",
        registryData: testRegistryId,
        status: "want",
        quantity: 2,
        tags: [testTagId],
      });

      const count = await Collection.countDocuments({ userId: testUserId });
      expect(count).toBe(2);
    });

    it("should have no collectible papers yet", async () => {
      const count = await Paper.countDocuments({
        createdBy: testUserId,
        type: "collectible",
      });
      expect(count).toBe(0);
    });
  });

  describe("Migration Process", () => {
    it("should migrate all collectibles to paper", async () => {
      const result = await migrateCollectiblesToPaper();

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.errors).toHaveLength(0);
    });

    it("should skip already migrated items on re-run", async () => {
      const result = await migrateCollectiblesToPaper();

      expect(result.skipped).toBeGreaterThanOrEqual(2);
    });
  });

  describe("After Migration", () => {
    it("should have papers in Paper collection", async () => {
      const papers = await Paper.find({
        createdBy: testUserId,
        type: "collectible",
      });

      expect(papers.length).toBeGreaterThanOrEqual(2);
    });

    it("should preserve all collectible data", async () => {
      const originalCollectible = await Collection.findOne({
        itemId: "test-item-1",
        userId: testUserId,
      });

      const migratedPaper = await Paper.findOne({
        createdBy: testUserId,
        "data.itemId": "test-item-1",
      });

      expect(migratedPaper).toBeDefined();
      expect(migratedPaper!.type).toBe("collectible");
      expect(migratedPaper!.createdBy).toBe(originalCollectible!.userId);
      expect(migratedPaper!.data.itemId).toBe(originalCollectible!.itemId);
      expect(migratedPaper!.data.provider).toBe(originalCollectible!.provider);
      expect(migratedPaper!.data.status).toBe(originalCollectible!.status);
      expect(migratedPaper!.data.quantity).toBe(originalCollectible!.quantity);
    });

    it("should preserve tags references", async () => {
      const migratedPaper = await Paper.findOne({
        createdBy: testUserId,
        "data.itemId": "test-item-1",
      }).populate("tags");

      expect(migratedPaper).toBeDefined();
      expect(migratedPaper!.tags).toHaveLength(1);
      expect((migratedPaper!.tags[0] as any)._id.toString()).toBe(testTagId);
    });

    it("should preserve registry references", async () => {
      const migratedPaper = await Paper.findOne({
        createdBy: testUserId,
        "data.itemId": "test-item-1",
      });

      expect(migratedPaper).toBeDefined();
      expect(migratedPaper!.data.registryData.toString()).toBe(testRegistryId);
    });

    it("should have matching counts", async () => {
      const collectibleCount = await Collection.countDocuments({
        userId: testUserId,
      });
      const paperCount = await Paper.countDocuments({
        createdBy: testUserId,
        type: "collectible",
      });

      expect(paperCount).toBe(collectibleCount);
    });
  });

  describe("Query Performance After Migration", () => {
    it("should efficiently query by type and createdBy", async () => {
      const papers = await Paper.find({
        type: "collectible",
        createdBy: testUserId,
      });

      expect(papers.length).toBeGreaterThanOrEqual(2);
    });

    it("should efficiently query by itemId", async () => {
      const paper = await Paper.findOne({
        "data.itemId": "test-item-1",
        createdBy: testUserId,
      });

      expect(paper).toBeDefined();
      expect(paper!.data.itemId).toBe("test-item-1");
    });

    it("should efficiently query by tags", async () => {
      const papers = await Paper.find({
        type: "collectible",
        tags: testTagId,
      });

      expect(papers.length).toBeGreaterThanOrEqual(2);
    });
  });
});
