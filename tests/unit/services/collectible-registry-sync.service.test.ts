/**
 * Tests for CollectibleRegistry Incremental Sync
 *
 * These tests verify that the CollectibleRegistry service correctly handles
 * incremental sync with updatedAt timestamp filtering
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CollectibleRegistry } from "../../../src/models/collectible-registry";
import { CollectableRegistryService } from "../../../src/services/collectable-registry.service";

describe("CollectableRegistryService - Incremental Sync", () => {
  let service: CollectableRegistryService;

  beforeEach(async () => {
    // Clear collection
    await CollectibleRegistry.deleteMany({});

    service = await CollectableRegistryService.getInstance();
  });

  afterEach(async () => {
    await CollectibleRegistry.deleteMany({});
  });

  describe("getCollectableRegistrySince", () => {
    it("should return all records when no since parameter provided", async () => {
      // Create test records
      await CollectibleRegistry.create([
        {
          title: "LEGO Set 1",
          description: { content: [] },
          images: ["img1.jpg"],
          providerId: "1001",
          provider: "lego",
          tags: [],
        },
        {
          title: "LEGO Set 2",
          description: { content: [] },
          images: ["img2.jpg"],
          providerId: "1002",
          provider: "lego",
          tags: [],
        },
      ]);

      const results = await service.getCollectableRegistrySince("lego");

      expect(results).toHaveLength(2);
    });

    it("should return only records updated after since timestamp", async () => {
      // Create initial records
      const old1 = await CollectibleRegistry.create({
        title: "Old LEGO Set 1",
        description: { content: [] },
        images: ["img1.jpg"],
        providerId: "1001",
        provider: "lego",
        tags: [],
      });

      const old2 = await CollectibleRegistry.create({
        title: "Old LEGO Set 2",
        description: { content: [] },
        images: ["img2.jpg"],
        providerId: "1002",
        provider: "lego",
        tags: [],
      });

      // Get the timestamp after old records
      const sinceTimestamp = new Date();

      // Wait a moment to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create new record
      const newRecord = await CollectibleRegistry.create({
        title: "New LEGO Set",
        description: { content: [] },
        images: ["img3.jpg"],
        providerId: "1003",
        provider: "lego",
        tags: [],
      });

      // Query for records since timestamp
      const results = await service.getCollectableRegistrySince(
        "lego",
        sinceTimestamp,
      );

      expect(results).toHaveLength(1);
      expect(results[0].providerId).toBe("1003");
      expect(results[0].title).toBe("New LEGO Set");
    });

    it("should return empty array when no new records since timestamp", async () => {
      // Create records
      await CollectibleRegistry.create([
        {
          title: "LEGO Set 1",
          description: { content: [] },
          images: ["img1.jpg"],
          providerId: "1001",
          provider: "lego",
          tags: [],
        },
      ]);

      // Use future timestamp
      const futureTimestamp = new Date(Date.now() + 10000);

      const results = await service.getCollectableRegistrySince(
        "lego",
        futureTimestamp,
      );

      expect(results).toHaveLength(0);
    });

    it("should filter by provider when querying since timestamp", async () => {
      // Create lego records
      await CollectibleRegistry.create({
        title: "LEGO Set",
        description: { content: [] },
        images: ["img1.jpg"],
        providerId: "1001",
        provider: "lego",
        tags: [],
      });

      // Create book record
      await CollectibleRegistry.create({
        title: "Some Book",
        description: { content: [] },
        images: ["img2.jpg"],
        providerId: "isbn-123",
        provider: "book",
        tags: [],
      });

      const results = await service.getCollectableRegistrySince("lego");

      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe("lego");
    });

    it("should sort results by updatedAt ascending", async () => {
      // Create records with slight delays
      const first = await CollectibleRegistry.create({
        title: "First",
        description: { content: [] },
        images: ["img1.jpg"],
        providerId: "1001",
        provider: "lego",
        tags: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const second = await CollectibleRegistry.create({
        title: "Second",
        description: { content: [] },
        images: ["img2.jpg"],
        providerId: "1002",
        provider: "lego",
        tags: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const third = await CollectibleRegistry.create({
        title: "Third",
        description: { content: [] },
        images: ["img3.jpg"],
        providerId: "1003",
        provider: "lego",
        tags: [],
      });

      const results = await service.getCollectableRegistrySince("lego");

      expect(results).toHaveLength(3);
      expect(results[0].title).toBe("First");
      expect(results[1].title).toBe("Second");
      expect(results[2].title).toBe("Third");

      // Verify ascending order
      expect(results[0].updatedAt.getTime()).toBeLessThan(
        results[1].updatedAt.getTime(),
      );
      expect(results[1].updatedAt.getTime()).toBeLessThan(
        results[2].updatedAt.getTime(),
      );
    });

    it("should handle updated records correctly", async () => {
      // Create initial record
      const record = await CollectibleRegistry.create({
        title: "Original Title",
        description: { content: [] },
        images: ["img1.jpg"],
        providerId: "1001",
        provider: "lego",
        tags: [],
      });

      const originalUpdatedAt = record.updatedAt;

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update the record
      await CollectibleRegistry.updateOne(
        { _id: record._id },
        { $set: { title: "Updated Title" } },
      );

      // Query for records updated after original timestamp
      const results = await service.getCollectableRegistrySince(
        "lego",
        originalUpdatedAt,
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Updated Title");
    });

    it("should not return the exact timestamp record (uses $gt not $gte)", async () => {
      // Create a record
      const record = await CollectibleRegistry.create({
        title: "Test Record",
        description: { content: [] },
        images: ["img1.jpg"],
        providerId: "1001",
        provider: "lego",
        tags: [],
      });

      // Use exact updatedAt timestamp
      const results = await service.getCollectableRegistrySince(
        "lego",
        record.updatedAt,
      );

      // Should not include the record with exact timestamp (uses $gt)
      expect(results).toHaveLength(0);
    });
  });

  describe("getCollectableRegistryByProviderId backwards compatibility", () => {
    it("should still return all records without timestamp filtering", async () => {
      await CollectibleRegistry.create([
        {
          title: "LEGO Set 1",
          description: { content: [] },
          images: ["img1.jpg"],
          providerId: "1001",
          provider: "lego",
          tags: [],
        },
        {
          title: "LEGO Set 2",
          description: { content: [] },
          images: ["img2.jpg"],
          providerId: "1002",
          provider: "lego",
          tags: [],
        },
      ]);

      const results = await service.getCollectableRegistryByProviderId("lego");

      expect(results).toHaveLength(2);
    });
  });
});
