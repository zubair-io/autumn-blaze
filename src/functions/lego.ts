import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getLegos } from "../services/lego.service";

// Main handler function
async function legoHttpHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("HTTP trigger function processed a request.");

  return {
    status: 200,
    jsonBody: await getLegos(),
  };
}

// Register the function
app.http("legoFunction", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: legoHttpHandler,
  route: "lego",
});
