import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

// API key for server-to-server auth from Paperbark
const PAPERBARK_SERVICE_KEY = process.env.PAPERBARK_SERVICE_KEY;

/**
 * Verify service-to-service API key
 */
function verifyServiceKey(request: HttpRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const key = authHeader.split(" ")[1];
  return key === PAPERBARK_SERVICE_KEY;
}

/**
 * Collaboration event types for Just-Maple collaboration feature
 */
interface CollabEvent {
  type: "steps" | "init" | "resync";
  noteId: string;
  version?: number;
  steps?: unknown[];
  clientIDs?: string[];
  clientID?: string;
  doc?: unknown; // ProseMirror document
}

interface BroadcastCollabRequest {
  event: CollabEvent;
  recipientUserIds: string[];
}

/**
 * Azure Function to broadcast collaboration events via SignalR
 * Called by Just-Maple backend in production mode
 */
async function broadcastCollabEvent(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Processing collab broadcast request");

  try {
    // Verify service-to-service API key
    if (!verifyServiceKey(request)) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized" },
      };
    }

    const body = (await request.json()) as BroadcastCollabRequest;
    const { event, recipientUserIds } = body;

    // Create SignalR messages for each recipient
    const messages = recipientUserIds.map((userId) => ({
      target: "collabUpdate", // SignalR method name on client
      arguments: [event],
      userId,
    }));

    context.log(`Broadcasting collab event to ${messages.length} recipients`);
    context.extraOutputs.set("signalRMessages", messages);

    return {
      status: 200,
      jsonBody: { success: true, recipientCount: messages.length },
    };
  } catch (error) {
    context.error("Collab broadcast failed:", error);
    return {
      status: error.status || 500,
      jsonBody: { error: error.message || "Internal server error" },
    };
  }
}

// Register broadcast function with separate "collab" hub
app.http("broadcastCollabEvent", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: broadcastCollabEvent,
  route: "collab/broadcast",
  extraOutputs: [
    {
      type: "signalR",
      name: "signalRMessages",
      hubName: "collab", // Separate hub for collaboration
      connectionStringSetting: "AzureSignalRConnectionString",
    },
  ],
});
