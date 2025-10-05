import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CollectableRegistryService } from "../services/collectable-registry.service";

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
  const service = await CollectableRegistryService.getInstance();

  const jsonBody = await service.getCollectableRegistryByProviderId(
    itemProvider,
  );

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
