import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CollectableRegistryService } from "../services/collectable-registry.service";
import { CollectibleRegistry } from "../models/collectible-registry";

interface LegoSetsResponse {
  set: string;
  title: string;
  year: string;
  theme: string;
  parts: string;
  image: string;
}
async function getLegoCollectableRegistry(
  request: HttpRequest,
  context: InvocationContext,
) {
  const itemId = request.params.id;
  const itemProvider = "lego";
  const service = await CollectableRegistryService.getInstance();

  const jsonBody = await service.getOrCreateCollectableRegistry(
    itemId,
    itemProvider,
  );
  delete jsonBody.providerData;

  return {
    jsonBody,
    status: 200,
  };
}

async function getAllLegoCollectableRegistry(
  request: HttpRequest,
  context: InvocationContext,
) {
  const itemProvider = "lego";
  const updatedAt = request.query.get("updatedAt");
  const service = await CollectableRegistryService.getInstance();

  const jsonBody = updatedAt
    ? await service.getCollectableRegistrySince(
        itemProvider,
        new Date(updatedAt),
      )
    : await service.getCollectableRegistryByProviderId(itemProvider);

  return {
    jsonBody,
    status: 200,
  };
}

async function getLegoCollectableRegistryByUPC(
  request: HttpRequest,
  context: InvocationContext,
) {
  const upc = request.params.upc;
  const itemProvider = "lego";
  const service = await CollectableRegistryService.getInstance();

  const jsonBody = await service.getOrCreateCollectableRegistryByUPC(upc);
  delete jsonBody.providerData;

  return {
    jsonBody,
    status: 200,
  };
}

async function getCollectableRegistry(
  request: HttpRequest,
  context: InvocationContext,
) {
  const id = request.params.id;
  const service = await CollectableRegistryService.getInstance();

  const jsonBody = await service.getCollectableRegistryById(id);
  delete jsonBody.providerData;

  return {
    jsonBody,
    status: 200,
  };
}

async function syncLegoSets(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // await authenticateRequest(request, "write");
    console.log("Starting LEGO set sync...");

    // Get query parameters
    const yearParam = request.query.get("currentYear");
    const fillMissing = request.query.get("fillMissing") === "true";
    const specificId = request.query.get("id");

    // Fetch LEGO sets from the API
    const response = await fetch("https://tatarian.justmaple.app/api/lego");
    const allSets: LegoSetsResponse[] = await response.json();

    let currentYearSets: any[];

    if (specificId) {
      // If specific ID is provided, only sync that one set
      console.log(`Syncing specific set: ${specificId}`);
      currentYearSets = allSets.filter((set: any) => set.set === specificId);

      if (currentYearSets.length === 0) {
        return {
          jsonBody: { error: `Set ${specificId} not found` },
          status: 404,
        };
      }
    } else {
      // Filter to specified year (or current year) and sets with more than 1 part
      const currentYear = yearParam || new Date().getFullYear().toString();
      currentYearSets = allSets.filter(
        (set: any) => set.year === currentYear && parseInt(set.parts) > 1,
      );

      console.log(
        `Found ${currentYearSets.length} LEGO sets for year ${currentYear} with >1 parts`,
      );
    }

    const registryService = await CollectableRegistryService.getInstance();
    const syncedProviderIds: string[] = [];
    const errors: string[] = [];
    let skipped = 0;
    let rateLimited = false;

    let setsToSync: any[];

    if (specificId) {
      // For specific ID, always sync even if it exists
      setsToSync = currentYearSets;
    } else if (fillMissing) {
      // Find sets with missing or incomplete data
      console.log("Fill missing mode: finding sets with incomplete data...");

      const setIds = currentYearSets.map((set: any) => set.set);
      const existingRegistries = await CollectibleRegistry.find({
        providerId: { $in: setIds },
        provider: "lego",
      });

      const incompleteSets = existingRegistries
        .filter((reg) => {
          // Check if UPC or EAN is missing, or description is empty
          const missingBarcode = !reg.upc && !reg.ean;
          const emptyDescription =
            !reg.description ||
            (typeof reg.description === "object" &&
              (!reg.description.content ||
                reg.description.content.length === 0));

          return missingBarcode || emptyDescription;
        })
        .map((reg) => reg.providerId);

      setsToSync = currentYearSets.filter((set: any) =>
        incompleteSets.includes(set.set),
      );

      console.log(
        `Found ${setsToSync.length} sets with missing data to re-sync`,
      );

      const existingCompleteIds = new Set(
        existingRegistries
          .filter((reg) => !incompleteSets.includes(reg.providerId))
          .map((reg) => reg.providerId),
      );
      skipped = existingCompleteIds.size;
    } else {
      // Normal mode: Bulk check which sets already exist in the database
      const setIds = currentYearSets.map((set: any) => set.set);
      console.log(`Checking ${setIds.length} sets in database...`);

      const existingRegistries = await CollectibleRegistry.find({
        providerId: { $in: setIds },
        provider: "lego",
      }).select("providerId");

      const existingProviderIds = new Set(
        existingRegistries.map((reg) => reg.providerId),
      );
      console.log(`Found ${existingProviderIds.size} sets already in database`);

      // Filter out sets that already exist
      setsToSync = currentYearSets.filter(
        (set: any) => !existingProviderIds.has(set.set),
      );
      skipped = existingProviderIds.size;
    }

    console.log(`${setsToSync.length} sets need to be synced`);

    for (const set of setsToSync) {
      try {
        console.log(`Syncing LEGO set: ${set.set} - ${set.title}`);

        // Check if it exists (for update scenarios)
        const existingRegistry = await registryService.getCollectableRegistry(
          set.set,
          "lego",
        );

        if (existingRegistry) {
          // Update existing registry
          console.log(`Updating existing registry for set ${set.set}`);

          // Fetch new data
          const newData = await registryService.createCollectableRegistryData(
            "lego",
            set.set,
          );

          // Update the existing document
          await CollectibleRegistry.findByIdAndUpdate(existingRegistry._id, {
            upc: newData.upc || existingRegistry.upc,
            ean: newData.ean || existingRegistry.ean,
            title: newData.title || existingRegistry.title,
            description: newData.description || existingRegistry.description,
            images: newData.images || existingRegistry.images,
            tags: newData.tags || existingRegistry.tags,
            providerData: newData.providerData || existingRegistry.providerData,
          });

          console.log(`Successfully updated registry for set ${set.set}`);
        } else {
          // Create new registry entry
          console.log(`Creating new registry for set ${set.set}`);
          await registryService.createCollectableRegistryItem("lego", set.set);
        }

        syncedProviderIds.push(set.set);

        // Add 500ms delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error) {
        // Check if this is a rate limit error
        if (
          error.statusCode === 429 ||
          error.message?.includes("Rate limited")
        ) {
          const rateLimitMsg = `Rate limited by Brickset at ${set.set}. Stopping sync.`;
          console.error(rateLimitMsg);
          errors.push(rateLimitMsg);
          rateLimited = true;
          break; // Stop the batch processing
        }

        const errorMsg = `${set.set}: ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    const completeMsg = rateLimited
      ? `Sync stopped due to rate limiting: ${syncedProviderIds.length} synced, ${skipped} skipped, ${errors.length} errors`
      : `Sync complete: ${syncedProviderIds.length} synced, ${skipped} skipped, ${errors.length} errors`;

    console.log(completeMsg);

    return {
      jsonBody: {
        synced: syncedProviderIds.length,
        syncedProviderIds,
        skipped,
        errors,
        rateLimited,
      },
      status: 200,
    };
  } catch (error) {
    console.error(`Sync failed: ${error.message}`);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}
app.http("syncLegoSets", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "collectible-registry/sync-lego",
  handler: syncLegoSets,
});

app.http("lego-collectible", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "collectible-registry/{id}",
  handler: getCollectableRegistry,
});

app.http("get-lego-collectible", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "collectible-registry",
  handler: getAllLegoCollectableRegistry,
});

app.http("lego-collectible-registry-by-upc", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "collectible-registry/lego/upc/{upc}",
  handler: getLegoCollectableRegistryByUPC,
});

app.http("lego-collectible-registry", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "collectible-registry/lego/id/{id}",
  handler: getLegoCollectableRegistry,
});
