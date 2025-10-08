import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as jwt from "jsonwebtoken";
import { MapleUser } from "../models/maple-user";

interface AppleServerNotification {
  payload: string; // JWT signed by Apple
}

interface AppleEventPayload {
  iss: string; // Apple issuer
  aud: string; // Your client ID
  iat: number;
  jti: string; // Unique event ID
  events: {
    type: string; // Event type
    sub: string; // Apple User ID
    event_time: number;
    email?: string;
  };
}

// Handle Apple Server-to-Server notifications
async function handleAppleNotifications(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body: AppleServerNotification = await request.json() as any;

    if (!body.payload) {
      return {
        jsonBody: { error: 'Missing payload' },
        status: 400,
      };
    }

    // Decode the JWT (in production, you should verify the signature with Apple's public keys)
    const decoded = jwt.decode(body.payload) as AppleEventPayload;

    if (!decoded || !decoded.events) {
      context.warn('Invalid notification payload');
      return {
        jsonBody: { error: 'Invalid payload' },
        status: 400,
      };
    }

    const { type, sub, event_time, email } = decoded.events;
    const appleUserId = sub;

    context.log(`Received Apple notification: ${type} for user ${appleUserId}`);

    switch (type) {
      case 'email-disabled':
      case 'email-enabled':
        // User changed email preferences
        context.log(`User ${appleUserId} changed email settings: ${type}`);

        if (email && type === 'email-enabled') {
          // Update user's email
          await MapleUser.updateOne(
            { appleUserId },
            { email }
          );
          context.log(`Updated email for user ${appleUserId}`);
        }
        break;

      case 'consent-revoked':
        // User revoked consent - remove their data or mark account as inactive
        context.log(`User ${appleUserId} revoked consent`);

        // Option 1: Mark as inactive (keep data)
        await MapleUser.updateOne(
          { appleUserId },
          { $set: { isActive: false, revokedAt: new Date() } }
        );

        // Option 2: Delete user data (uncomment if required by privacy policy)
        // await MapleUser.deleteOne({ appleUserId });
        // await Recording.deleteMany({ userId: user._id });
        // await CustomPrompt.deleteMany({ userId: user._id });

        break;

      case 'account-delete':
        // User deleted their Apple ID - must delete all their data
        context.log(`User ${appleUserId} deleted Apple ID - deleting all data`);

        const user = await MapleUser.findOne({ appleUserId });
        if (user) {
          // Import Recording and CustomPrompt models
          const { Recording } = await import('../models/recording');
          const { CustomPrompt } = await import('../models/custom-prompt');

          // Delete all user data
          await Recording.deleteMany({ userId: user._id });
          await CustomPrompt.deleteMany({ userId: user._id });
          await MapleUser.deleteOne({ appleUserId });

          context.log(`Deleted all data for user ${appleUserId}`);
        }
        break;

      default:
        context.warn(`Unknown event type: ${type}`);
    }

    // Always return 200 to acknowledge receipt
    return {
      status: 200,
    };

  } catch (error) {
    context.error('Error processing Apple notification:', error);

    // Return 200 even on error to prevent Apple from retrying
    // Log the error for investigation
    return {
      status: 200,
    };
  }
}

app.http("appleNotifications", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/apple/notifications",
  handler: handleAppleNotifications,
});
