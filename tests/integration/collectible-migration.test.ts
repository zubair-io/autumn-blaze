/**
 * Integration Tests for Collectible → Paper Migration
 *
 * Tests the complete migration process and validates data integrity
 */

import { describe, it, expect, beforeEach } from "vitest";
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

  beforeEach(async () => {
    // Create fresh test data for each test
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
  });

  it("should complete full migration workflow with data integrity", async () => {
    // 1. Verify initial state
    const initialCollectibleCount = await Collection.countDocuments({
      userId: testUserId,
    });
    const initialPaperCount = await Paper.countDocuments({
      createdBy: testUserId,
      type: "collectible",
    });

    expect(initialCollectibleCount).toBe(2);
    expect(initialPaperCount).toBe(0);

    // 2. Run migration
    const result = await migrateCollectiblesToPaper({
      skipConnect: true,
      skipDisconnect: true,
    });

    expect(result.total).toBe(2);
    expect(result.migrated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // 3. Verify papers were created
    const papers = await Paper.find({
      createdBy: testUserId,
      type: "collectible",
    });
    expect(papers.length).toBe(2);

    // 4. Verify data preservation
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

    // 5. Verify tags were preserved
    expect(migratedPaper!.tags).toHaveLength(1);
    expect(migratedPaper!.tags[0].toString()).toBe(testTagId);

    // 6. Verify registry reference
    expect(migratedPaper!.data.registryData.toString()).toBe(testRegistryId);

    // 7. Verify counts match
    const finalCollectibleCount = await Collection.countDocuments({
      userId: testUserId,
    });
    const finalPaperCount = await Paper.countDocuments({
      createdBy: testUserId,
      type: "collectible",
    });
    expect(finalPaperCount).toBe(finalCollectibleCount);
  });

  it("should skip already migrated items on re-run", async () => {
    // Run migration first time
    const firstRun = await migrateCollectiblesToPaper({
      skipConnect: true,
      skipDisconnect: true,
    });

    expect(firstRun.total).toBe(2);
    expect(firstRun.migrated).toBe(2);
    expect(firstRun.skipped).toBe(0);

    // Run migration second time
    const secondRun = await migrateCollectiblesToPaper({
      skipConnect: true,
      skipDisconnect: true,
    });

    expect(secondRun.total).toBe(2);
    expect(secondRun.skipped).toBe(2);
    expect(secondRun.migrated).toBe(0);
  });

  it("should support efficient queries after migration", async () => {
    // Run migration
    await migrateCollectiblesToPaper({
      skipConnect: true,
      skipDisconnect: true,
    });

    // Query by type and createdBy
    const papersByUser = await Paper.find({
      type: "collectible",
      createdBy: testUserId,
    });
    expect(papersByUser.length).toBe(2);

    // Query by itemId
    const paperByItemId = await Paper.findOne({
      "data.itemId": "test-item-1",
      createdBy: testUserId,
    });
    expect(paperByItemId).toBeDefined();
    expect(paperByItemId!.data.itemId).toBe("test-item-1");

    // Query by tags
    const papersByTag = await Paper.find({
      type: "collectible",
      tags: testTagId,
    });
    expect(papersByTag.length).toBe(2);
  });
});
