import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";

/**
 * Azure Function to provide SignalR connection info with authentication
 * Used for the Just-Maple chat feature
 * @param request The HTTP request
 * @param context The function invocation context
 * @returns An HTTP response with the SignalR connection info
 */
export async function syncAuth(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Processing SignalR authentication request for chat hub");

  try {
    // Use your existing authorization function to authenticate the request
    const auth = await authenticateRequest(request, "write");
    const userId = auth.sub;

    if (!userId) {
      context.error("User ID not found in auth.sub");
      return {
        status: 400,
        body: "User ID not found in authentication data",
      };
    }
    const requestedUserId = request.query.get("userId");

    // Security check: Verify that the requested user ID matches the authenticated user ID
    if (requestedUserId && requestedUserId !== userId) {
      context.error(`User ID mismatch: ${requestedUserId} vs ${userId}`);
      return {
        status: 403,
        body: "Forbidden: User ID does not match authenticated user",
      };
    }

    // Log the user ID that we're going to use

    context.log(`Authenticated user ID: ${userId}`);

    // Create a new connection info request with the user ID
    // This is the key step - we need to create connection info specifically for this user
    const connectionInfo = await context.extraInputs.get("connectionInfo");

    if (!connectionInfo) {
      return {
        status: 500,
        body: "Error retrieving SignalR connection information",
      };
    }

    // Return the connection info
    return {
      status: 200,
      jsonBody: connectionInfo,
    };
  } catch (e) {
    // Handle authorization errors
    context.error("Authorization failed:", e);
    return {
      status: 401,
      body: "401 Unauthorized",
    };
  }
}

app.http("syncAuth", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "signalr",
  extraInputs: [
    {
      type: "signalRConnectionInfo",
      name: "connectionInfo",
      hubName: "chat",
      connectionStringSetting: "AzureSignalRConnectionString",
      userId: "{query.userId}", // This will be provided by the client
    },
  ],
  handler: syncAuth,
});
