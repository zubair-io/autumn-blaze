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
 * Chat event types for Just-Maple chat feature
 */
interface ChatEvent {
  action: "message" | "typing" | "edited" | "deleted";
  data: unknown;
  tagId: string;
  userId: string;
  timestamp: string;
}

interface BroadcastRequest {
  event: ChatEvent;
  recipientUserIds: string[];
}

/**
 * Azure Function to broadcast chat events to users via SignalR
 * Called by Just-Maple backend in production mode
 */
async function broadcastChatEvent(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing chat broadcast request");

  try {
    // Verify service-to-service API key
    if (!verifyServiceKey(request)) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized" },
      };
    }

    const body = (await request.json()) as BroadcastRequest;
    const { event, recipientUserIds } = body;

    // Create SignalR messages for each recipient
    const messages = recipientUserIds.map((userId) => ({
      target: "newMessage",
      arguments: [event],
      userId,
    }));

    context.log(`Broadcasting chat event to ${messages.length} recipients`);
    context.extraOutputs.set("signalRMessages", messages);

    return {
      status: 200,
      jsonBody: { success: true, recipientCount: messages.length },
    };
  } catch (error) {
    context.error("Chat broadcast failed:", error);
    return {
      status: error.status || 500,
      jsonBody: { error: error.message || "Internal server error" },
    };
  }
}

/**
 * Azure Function to send typing indicator via SignalR
 */
async function broadcastTyping(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing typing indicator broadcast");

  try {
    // Verify service-to-service API key
    if (!verifyServiceKey(request)) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized" },
      };
    }

    const body = (await request.json()) as {
      tagId: string;
      userId: string;
      isTyping: boolean;
      recipientUserIds: string[];
    };

    const { tagId, userId, isTyping, recipientUserIds } = body;

    if (!tagId || !userId || !recipientUserIds || !Array.isArray(recipientUserIds)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request body" },
      };
    }

    const typingEvent: ChatEvent = {
      action: "typing",
      data: { tagId, userId, isTyping },
      tagId,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Create SignalR messages for each recipient (excluding sender)
    const messages = recipientUserIds
      .filter((id) => id !== userId)
      .map((recipientId) => ({
        target: "newMessage",
        arguments: [typingEvent],
        userId: recipientId,
      }));

    context.extraOutputs.set("signalRMessages", messages);

    return {
      status: 200,
      jsonBody: { success: true },
    };
  } catch (error) {
    context.error("Typing broadcast failed:", error);
    return {
      status: error.status || 500,
      jsonBody: { error: error.message || "Internal server error" },
    };
  }
}

// Register broadcast function
app.http("broadcastChatEvent", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: broadcastChatEvent,
  route: "chat/broadcast",
  extraOutputs: [
    {
      type: "signalR",
      name: "signalRMessages",
      hubName: "chat",
      connectionStringSetting: "AzureSignalRConnectionString",
    },
  ],
});

// Register typing indicator function
app.http("broadcastTyping", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: broadcastTyping,
  route: "chat/typing",
  extraOutputs: [
    {
      type: "signalR",
      name: "signalRMessages",
      hubName: "chat",
      connectionStringSetting: "AzureSignalRConnectionString",
    },
  ],
});
