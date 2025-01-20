import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CollectableService } from "../services/collectable.service";
import { authenticateRequest } from "../middleware/auth";
import { CollectableRegistryService } from "../services/collectable-registry.service";

async function listCollectible(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const service = await CollectableService.getInstance();
    const collections = await service.listUserCollectible(auth.sub);

    return {
      jsonBody: collections,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Create Collection
async function createCollectible(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const body: any = await request.json();

    const service = await CollectableService.getInstance();
    const registryService = await CollectableRegistryService.getInstance();
    const registryData = await registryService.getOrCreateCollectableRegistry(
      body.itemId,
      body.provider,
    );
    body.registryData = registryData._id;
    const newCollection = await service.createCollectible(auth.sub, body);
    newCollection.registryData = registryData;

    return {
      jsonBody: newCollection,
      status: 201,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

async function deleteCollectible(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const auth = await authenticateRequest(request, "write");
  const itemId = request.params.id;
  const service = await CollectableService.getInstance();
  return await service.deleteCollectible(auth.sub, itemId);
}

// Register routes
app.http("listCollectibles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "collectibles",
  handler: listCollectible,
});

app.http("createCollectible", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "collectibles",
  handler: createCollectible,
});

app.http("deleteCollectible", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "collectibles/{id}",
  handler: deleteCollectible,
});
