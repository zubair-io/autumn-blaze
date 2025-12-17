import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

// Paperbark API URL for token verification
const PAPERBARK_API_URL = process.env.PAPERBARK_API_URL || "https://paperbark.justmaple.app";

/**
 * Verify JWT token by calling Paperbark API
 */
async function verifyPaperbarkToken(token: string): Promise<{ userId: string }> {
  const response = await fetch(`${PAPERBARK_API_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Token verification failed: ${response.status}`);
  }

  const user = await response.json() as { _id: string };
  return { userId: user._id };
}

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
    // Get token from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { status: 401, body: "No token provided" };
    }
    const token = authHeader.split(" ")[1];

    // Verify token via Paperbark API
    const auth = await verifyPaperbarkToken(token);
    const userId = auth.userId;

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
