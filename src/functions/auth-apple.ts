import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as jwt from "jsonwebtoken";
import appleSignin from "apple-signin-auth";
import { MapleUser } from "../models/maple-user";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string; // Apple User ID
  email?: string;
  email_verified?: boolean;
}

// Sign in with Apple
async function appleSignIn(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body: any = await request.json();
    const { identityToken, authorizationCode, user } = body;

    if (!identityToken) {
      return {
        jsonBody: { error: 'Missing identityToken' },
        status: 400,
      };
    }

    // Verify the identity token with Apple
    let decoded: AppleIdTokenPayload;
    try {
      const appleResponse = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID!,
        ignoreExpiration: false,
      });
      decoded = appleResponse as AppleIdTokenPayload;
    } catch (error) {
      context.error('Failed to verify Apple ID token:', error);
      return {
        jsonBody: { error: 'Invalid identity token' },
        status: 401,
      };
    }

    const appleUserId = decoded.sub;
    const email = decoded.email || user?.email;

    if (!email) {
      return {
        jsonBody: { error: 'Email is required for first-time sign in' },
        status: 400,
      };
    }

    // Find or create user
    let mapleUser = await MapleUser.findOne({ appleUserId });

    if (!mapleUser) {
      // Create new user
      mapleUser = new MapleUser({
        appleUserId,
        email,
        settings: {
          preferredLanguage: 'en',
        },
      });
      await mapleUser.save();

      // Initialize built-in prompts for new user
      const promptsToCreate = BUILT_IN_PROMPTS.map(prompt => ({
        userId: mapleUser._id,
        ...prompt,
      }));

      await CustomPrompt.insertMany(promptsToCreate);

      context.log(`New user created: ${appleUserId}`);
    } else {
      // Update email if it changed
      if (email && mapleUser.email !== email) {
        mapleUser.email = email;
        await mapleUser.save();
      }
    }

    // Generate JWT tokens for our API
    const accessToken = jwt.sign(
      {
        sub: appleUserId,
        email: mapleUser.email,
        type: 'access',
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: process.env.JWT_EXPIRY || '7d',
      }
    );

    const refreshToken = jwt.sign(
      {
        sub: appleUserId,
        type: 'refresh',
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '30d',
      }
    );

    return {
      jsonBody: {
        accessToken,
        refreshToken,
        user: {
          id: mapleUser._id,
          appleUserId: mapleUser.appleUserId,
          email: mapleUser.email,
          settings: mapleUser.settings,
        },
      },
      status: 200,
    };
  } catch (error) {
    context.error('Error during Apple sign in:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Refresh access token
async function refreshAccessToken(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body: any = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return {
        jsonBody: { error: 'Missing refreshToken' },
        status: 400,
      };
    }

    // Verify refresh token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!);
    } catch (error) {
      return {
        jsonBody: { error: 'Invalid or expired refresh token' },
        status: 401,
      };
    }

    if (decoded.type !== 'refresh') {
      return {
        jsonBody: { error: 'Invalid token type' },
        status: 401,
      };
    }

    // Get user
    const user = await MapleUser.findOne({ appleUserId: decoded.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        sub: user.appleUserId,
        email: user.email,
        type: 'access',
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: process.env.JWT_EXPIRY || '7d',
      }
    );

    return {
      jsonBody: { accessToken },
      status: 200,
    };
  } catch (error) {
    context.error('Error refreshing access token:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("appleSignIn", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/apple",
  handler: appleSignIn,
});

app.http("refreshAccessToken", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/refresh",
  handler: refreshAccessToken,
});
