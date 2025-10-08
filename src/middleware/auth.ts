// src/middleware/auth.ts
import { HttpRequest } from "@azure/functions";
import * as jwt from "jsonwebtoken";
import * as jwks from "jwks-rsa";
import { HttpError } from "../utils/error";

export type AccessLevel = "read" | "write" | "admin";

interface JWTPayload {
  sub: string; // Apple User ID
  email: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

const client = jwks({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err, key: any) {
    const signingKey = key?.publicKey || key?.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Authenticate with Maple JWT (Sign in with Apple)
async function authenticateMapleJWT(token: string): Promise<JWTPayload> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    if (decoded.type !== 'access') {
      throw new HttpError('Invalid token type. Use access token.', 401);
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      throw new HttpError('Token expired', 401);
    }

    return decoded;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new HttpError('Invalid token', 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new HttpError('Token expired', 401);
    }
    throw error;
  }
}

// Legacy Auth0 authentication
async function authenticateAuth0JWT(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: any = {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ["RS256"],
    };
    jwt.verify(token, getKey, options, (err, decoded) => {
      if (err) {
        reject(new HttpError("Invalid token", 401));
        return;
      }
      resolve(decoded);
    });
  });
}

export async function authenticateRequest(
  req: HttpRequest,
  requiredAccess?: AccessLevel,
): Promise<any> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError("No token provided", 401);
  }

  const token = authHeader.split(" ")[1];

  // Try Maple JWT first (for Sign in with Apple)
  if (process.env.JWT_SECRET) {
    try {
      return await authenticateMapleJWT(token);
    } catch (error) {
      // If Maple JWT fails, try Auth0 (for backward compatibility)
      if (process.env.AUTH0_DOMAIN) {
        return await authenticateAuth0JWT(token);
      }
      throw error;
    }
  }

  // Fallback to Auth0 only
  if (process.env.AUTH0_DOMAIN) {
    return await authenticateAuth0JWT(token);
  }

  throw new HttpError("No authentication method configured", 500);
}
