// src/middleware/auth.ts
import { HttpRequest } from "@azure/functions";
import * as jwt from "jsonwebtoken";
import * as jwks from "jwks-rsa";

export type AccessLevel = "read" | "write" | "admin";

const client = jwks({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
});

function getKey(header: any, callback: any) {
  console.log({ header });
  client.getSigningKey(header.kid, function (err, key: any) {
    const signingKey = key?.publicKey || key?.rsaPublicKey;
    callback(null, signingKey);
  });
}

export async function authenticateRequest(
  req: HttpRequest,
  requiredAccess?: AccessLevel
): Promise<any> {
  return new Promise((resolve, reject) => {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      reject(new Error("No token provided"));
      return;
    }

    const token = authHeader.split(" ")[1];

    const options: any = {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ["RS256"],
    };
    console.log({ options });
    jwt.verify(token, getKey, options, (err, decoded) => {
      if (err) {
        reject(new Error("Invalid token"));
        return;
      }

      // You can check permissions from the decoded token
      // Auth0 tokens include permissions in the scope or permissions claim
      // if (requiredAccess) {
      //   const permissions = decoded || [];
      //   if (!permissions.includes(`${requiredAccess}:all`)) {
      //     reject(new Error("Insufficient permissions"));
      //     return;
      //   }
      // }

      resolve(decoded);
    });
  });
}
