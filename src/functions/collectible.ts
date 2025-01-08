// src/functions/collections.ts
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CollectibleService } from "../services/collection.service";
import { authenticateRequest } from "../middleware/auth";

async function listCollectible(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const service = await CollectibleService.getInstance();
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
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    console.log(auth);
    const body: any = await request.json();

    const service = await CollectibleService.getInstance();
    const newCollection = await service.createCollectible(auth.sub, body);

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
