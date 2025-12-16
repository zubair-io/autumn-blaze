import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";

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
    // Authenticate the request
    const auth = await authenticateRequest(request, "write");
    const senderId = auth.sub;

    if (!senderId) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized" },
      };
    }

    const body = (await request.json()) as BroadcastRequest;
    const { event, recipientUserIds } = body;

    if (!event || !recipientUserIds || !Array.isArray(recipientUserIds)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request body" },
      };
    }

    // Verify sender matches the event userId
    if (event.userId !== senderId) {
      return {
        status: 403,
        jsonBody: { error: "Forbidden: userId mismatch" },
      };
    }

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
    const auth = await authenticateRequest(request, "write");
    const senderId = auth.sub;

    if (!senderId) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized" },
      };
    }

    const body = (await request.json()) as {
      tagId: string;
      isTyping: boolean;
      recipientUserIds: string[];
    };

    const { tagId, isTyping, recipientUserIds } = body;

    if (!tagId || !recipientUserIds || !Array.isArray(recipientUserIds)) {
      return {
        status: 400,
        jsonBody: { error: "Invalid request body" },
      };
    }

    const typingEvent: ChatEvent = {
      action: "typing",
      data: { tagId, userId: senderId, isTyping },
      tagId,
      userId: senderId,
      timestamp: new Date().toISOString(),
    };

    // Create SignalR messages for each recipient (excluding sender)
    const messages = recipientUserIds
      .filter((id) => id !== senderId)
      .map((userId) => ({
        target: "newMessage",
        arguments: [typingEvent],
        userId,
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
