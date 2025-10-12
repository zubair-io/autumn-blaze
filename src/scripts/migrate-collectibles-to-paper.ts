/**
 * Migration Script: Collectibles to Paper Collection
 *
 * This script migrates all documents from the Collectible collection to the Paper collection.
 *
 * Transformation:
 * - userId → createdBy
 * - All collectible-specific fields moved to data object
 * - Added type: "collectible"
 * - Preserved tags references
 * - Preserved timestamps
 */

import mongoose from "mongoose";
import { Collection } from "../models/collectible";
import { Paper } from "../models/paper.model";

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ itemId: string; error: string }>;
}

async function migrateCollectiblesToPaper(
  options: { skipConnect?: boolean; skipDisconnect?: boolean } = {},
): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Connect to MongoDB (skip if already connected in test environment)
    if (!options.skipConnect) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error("MONGODB_URI environment variable is required");
      }

      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");
      }
    }

    // Fetch all collectibles
    const collectibles = await Collection.find({}).lean();
    result.total = collectibles.length;

    console.log(`📦 Found ${result.total} collectibles to migrate`);

    // Migrate each collectible
    for (const collectible of collectibles) {
      try {
        // Check if already migrated (by checking if paper with same data.itemId exists)
        const existingPaper = await Paper.findOne({
          type: "collectible",
          "data.itemId": collectible.itemId,
          createdBy: collectible.userId,
        });

        if (existingPaper) {
          console.log(
            `⏭️  Skipping ${collectible.itemId} - already migrated`,
          );
          result.skipped++;
          continue;
        }

        // Transform collectible to paper format
        const paperData = {
          tags: collectible.tags,
          type: "collectible" as const,
          createdBy: collectible.userId,
          data: {
            itemId: collectible.itemId,
            provider: collectible.provider,
            registryData: collectible.registryData,
            status: collectible.status,
            quantity: collectible.quantity,
            created: collectible.created,
          },
          createdAt: (collectible as any).createdAt || collectible.created,
          updatedAt: (collectible as any).updatedAt || collectible.created,
        };

        // Create new paper document
        const paper = new Paper(paperData);
        await paper.save();

        console.log(`✅ Migrated ${collectible.itemId}`);
        result.migrated++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`❌ Error migrating ${collectible.itemId}:`, errorMessage);
        result.errors.push({
          itemId: collectible.itemId,
          error: errorMessage,
        });
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("Migration Summary:");
    console.log("=".repeat(50));
    console.log(`Total collectibles:     ${result.total}`);
    console.log(`Successfully migrated:  ${result.migrated}`);
    console.log(`Skipped (existing):     ${result.skipped}`);
    console.log(`Errors:                 ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach((err) => {
        console.log(`  - ${err.itemId}: ${err.error}`);
      });
    }

    return result;
  } catch (error) {
    console.error("Fatal migration error:", error);
    throw error;
  } finally {
    // Only disconnect if we connected (not in test environment)
    if (!options.skipDisconnect && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("\n✅ Disconnected from MongoDB");
    }
  }
}

// Validation function to compare collections
async function validateMigration(
  options: { skipConnect?: boolean; skipDisconnect?: boolean } = {},
): Promise<void> {
  try {
    // Connect to MongoDB (skip if already connected in test environment)
    if (!options.skipConnect) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error("MONGODB_URI environment variable is required");
      }

      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri);
      }
    }
    console.log("\n" + "=".repeat(50));
    console.log("Validation Report:");
    console.log("=".repeat(50));

    // Count original collectibles
    const collectibleCount = await Collection.countDocuments();
    console.log(`Original collectibles:  ${collectibleCount}`);

    // Count migrated papers
    const paperCount = await Paper.countDocuments({ type: "collectible" });
    console.log(`Migrated papers:        ${paperCount}`);

    // Check for discrepancies
    if (collectibleCount === paperCount) {
      console.log("✅ Counts match!");
    } else {
      console.log(
        `⚠️  Discrepancy: ${collectibleCount - paperCount} collectibles not migrated`,
      );
    }

    // Sample validation - compare first 5 records
    console.log("\nSample validation (first 5 records):");
    const sampleCollectibles = await Collection.find({}).limit(5).lean();

    for (const collectible of sampleCollectibles) {
      const paper = await Paper.findOne({
        type: "collectible",
        "data.itemId": collectible.itemId,
        createdBy: collectible.userId,
      });

      if (paper) {
        const dataMatch =
          paper.data.itemId === collectible.itemId &&
          paper.data.provider === collectible.provider &&
          paper.data.status === collectible.status &&
          paper.data.quantity === collectible.quantity;

        const tagsMatch =
          paper.tags.length === collectible.tags.length &&
          paper.tags.every((tag, index) =>
            tag.equals(collectible.tags[index]),
          );

        if (dataMatch && tagsMatch) {
          console.log(`  ✅ ${collectible.itemId} - Valid`);
        } else {
          console.log(`  ❌ ${collectible.itemId} - Data mismatch`);
        }
      } else {
        console.log(`  ❌ ${collectible.itemId} - Not found in papers`);
      }
    }
  } finally {
    // Only disconnect if we connected (not in test environment)
    if (!options.skipDisconnect && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];

  if (command === "validate") {
    validateMigration()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    migrateCollectiblesToPaper()
      .then((result) => {
        if (result.errors.length > 0) {
          process.exit(1);
        } else {
          process.exit(0);
        }
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
}

export { migrateCollectiblesToPaper, validateMigration };
