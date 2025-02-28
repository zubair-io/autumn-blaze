import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";
import { PathService } from "../services/path.service";

// List paths for user, optionally filtered by tag
async function listPaths(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const user = auth.sub;
    const tagId = request.query.get("tagId");

    const service = await PathService.getInstance();
    const paths = tagId
      ? await service.listByTag(tagId, user)
      : await service.list(user);

    return {
      status: 200,
      jsonBody: paths,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Add path(s)
async function addPaths(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const user = auth.sub;
    const pathData = await request.json();

    const service = await PathService.getInstance();
    const savedPaths = await service.add(pathData, user);

    const notificationPayload = {
      action: "newPath",
      data: {
        ...savedPaths,
      },
    };

    // Extract unique recipient IDs and create messages in one pass
    const messages = [
      ...new Set(
        savedPaths.tags.flatMap((tag) =>
          (tag.sharing?.sharedWith || []).map((info) => info.userId),
        ),
      ),
    ].map((userId) => ({
      target: "newMessage",
      arguments: [notificationPayload],
      userId,
    }));

    console.log(`Sending notifications to ${messages.length} recipients`);
    context.extraOutputs.set("signalRMessages", messages);

    return {
      status: 201,
      jsonBody: savedPaths,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Delete a single path
async function deletePath(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const user = auth.sub;
    const pathId = request.params.pathId;

    if (!pathId) {
      return {
        status: 400,
        jsonBody: { error: "pathId is required" },
      };
    }

    const service = await PathService.getInstance();

    const path = await service.getById(pathId, user);
    if (!path) {
      throw "No Path";
    }
    await service.deletePath(pathId, user);

    const notificationPayload = {
      action: "deletePath",
      data: pathId,
    };

    // Extract unique recipient IDs and create messages in one pass
    const messages = [
      ...new Set(
        path.tags.flatMap((tag) =>
          (tag.sharing?.sharedWith || []).map((info) => info.userId),
        ),
      ),
    ].map((userId) => ({
      target: "newMessage",
      arguments: [notificationPayload],
      userId,
    }));

    console.log(
      `Sending notifications to ${messages.length} recipients`,
      JSON.stringify(messages),
    );
    context.extraOutputs.set("signalRMessages", messages);

    return {
      status: 204,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Register the functions
app.http("listPaths", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listPaths,
  route: "paths",
});

app.http("addPaths", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: addPaths,
  route: "paths",
  extraOutputs: [
    {
      type: "signalR",
      name: "signalRMessages",
      hubName: "paths",
      connectionStringSetting: "AzureSignalRConnectionString",
    },
  ],
});

app.http("deletePath", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: deletePath,
  route: "paths/{pathId}",
  extraOutputs: [
    {
      type: "signalR",
      name: "signalRMessages",
      hubName: "paths",
      connectionStringSetting: "AzureSignalRConnectionString",
    },
  ],
});
