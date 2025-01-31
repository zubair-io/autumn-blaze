import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";
import { TagService } from "../services/tags.service";

// List Collections
async function listTags(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const service = await TagService.getInstance();
    const tags = await service.listUserTags(auth.sub);

    return {
      jsonBody: tags,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

async function createTag(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const service = await TagService.getInstance();
    const body: any = await request.json();
    const tag = await service.createTag(auth.sub, body);

    return {
      jsonBody: tag,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

export async function updateTag(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const id = request.params.id;
    const patch = await request.json();
    const user = await authenticateRequest(request, "read");

    if (!id || !patch || !user?.sub) {
      return {
        status: 400,
        jsonBody: { error: "Missing required parameters", id, patch, user },
      };
    }

    const tagService = await TagService.getInstance();
    const updatedTag = await tagService.updateTag(id, patch, user.sub);

    return {
      status: 200,
      jsonBody: updatedTag,
    };
  } catch (error) {
    const status =
      error.message.includes("not found") ||
      error.message.includes("write access")
        ? 403
        : 500;

    return {
      status,
      jsonBody: { error: error.message },
    };
  }
}

// Add User to Tag
async function addUserToTag(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const body: any = await request.json();
    const { tagId, userId, accessLevel } = body;

    const service = await TagService.getInstance();

    const updated = await service.addUserToTag({
      tagId,
      targetUserId: userId, // Note: renamed to match the interface
      accessLevel,
      requestingUserId: auth.sub,
    });

    return {
      jsonBody: updated,
      status: 200,
    };
  } catch (error) {
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("addUserToTag", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tags/{tagId}/share",
  handler: addUserToTag,
});

app.http("updateTag", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "tags/{id}",
  handler: updateTag,
});

app.http("listTags", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tags",
  handler: listTags,
});

app.http("createTag", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tags",
  handler: createTag,
});
