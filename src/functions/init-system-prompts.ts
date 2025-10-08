import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";

const SYSTEM_USER_ID = "11577eca-11f1-453f-81b3-d0bb46a995e3";

// Initialize system default prompts (called on app startup)
async function initializeSystemPrompts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Check if system prompts already exist
    const existingCount = await CustomPrompt.countDocuments({
      userId: SYSTEM_USER_ID,
    });

    if (existingCount > 0) {
      return {
        jsonBody: {
          message: "System prompts already initialized",
          count: existingCount,
        },
        status: 200,
      };
    }

    // Create system prompts
    const systemPrompts = BUILT_IN_PROMPTS.map(prompt => ({
      userId: SYSTEM_USER_ID,
      ...prompt,
    }));

    await CustomPrompt.insertMany(systemPrompts);

    context.log(`Initialized ${systemPrompts.length} system prompts`);

    return {
      jsonBody: {
        message: `Initialized ${systemPrompts.length} system prompts`,
        count: systemPrompts.length,
      },
      status: 200,
    };
  } catch (error) {
    context.error("Error initializing system prompts:", error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("initializeSystemPrompts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "system/init-prompts",
  handler: initializeSystemPrompts,
});
