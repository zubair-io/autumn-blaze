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
  context: InvocationContext
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

// Add User to Tag
async function addUserToTag(
  request: HttpRequest,
  context: InvocationContext
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

app.http("listTags", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tags",
  handler: listTags,
});
