import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";

const SYSTEM_USER_ID = "11577eca-11f1-453f-81b3-d0bb46a995e3";

// Get all prompts for user
async function getPrompts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");

    const userId = auth.sub;

    // Get both system prompts and user's custom prompts
    const prompts = await CustomPrompt.find({
      $or: [
        { userId: SYSTEM_USER_ID }, // System default prompts
        { userId: userId }           // User's custom prompts
      ]
    });

    context.log(`Found ${prompts.length} prompts for user ${userId} (including system prompts)`);
    context.log(`System user ID: ${SYSTEM_USER_ID}`);

    return {
      jsonBody: { prompts },
      status: 200,
    };
  } catch (error) {
    context.error('Error fetching prompts:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Create new custom prompt
async function createPrompt(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const body: any = await request.json();

    const { triggerWord, promptText, icon, color } = body;

    if (!triggerWord || !promptText) {
      return {
        jsonBody: { error: 'Missing required fields: triggerWord, promptText' },
        status: 400,
      };
    }

    const userId = auth.sub;

    // Check if trigger word already exists for this user
    const existing = await CustomPrompt.findOne({
      userId: userId,
      triggerWord: triggerWord.toLowerCase(),
    });

    if (existing) {
      return {
        jsonBody: { error: 'Trigger word already exists' },
        status: 409,
      };
    }

    const prompt = new CustomPrompt({
      userId: userId,
      triggerWord: triggerWord.toLowerCase(),
      promptText,
      icon: icon || 'mic',
      color: color || 'blue',
      isBuiltIn: false,
      isActive: true,
    });

    await prompt.save();

    return {
      jsonBody: { prompt },
      status: 201,
    };
  } catch (error) {
    context.error('Error creating prompt:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Update existing prompt
async function updatePrompt(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const promptId = request.params.id;
    const body: any = await request.json();

    const userId = auth.sub;

    const prompt = await CustomPrompt.findOne({
      _id: promptId,
      userId: userId,
    });

    if (!prompt) {
      return {
        jsonBody: { error: 'Prompt not found' },
        status: 404,
      };
    }

    // Don't allow updating built-in prompts
    if (prompt.isBuiltIn) {
      return {
        jsonBody: { error: 'Cannot modify built-in prompts' },
        status: 403,
      };
    }

    // Update allowed fields
    if (body.triggerWord !== undefined) {
      // Check if new trigger word conflicts
      const existing = await CustomPrompt.findOne({
        userId: userId,
        triggerWord: body.triggerWord.toLowerCase(),
        _id: { $ne: promptId },
      });

      if (existing) {
        return {
          jsonBody: { error: 'Trigger word already exists' },
          status: 409,
        };
      }

      prompt.triggerWord = body.triggerWord.toLowerCase();
    }

    if (body.promptText !== undefined) prompt.promptText = body.promptText;
    if (body.icon !== undefined) prompt.icon = body.icon;
    if (body.color !== undefined) prompt.color = body.color;
    if (body.isActive !== undefined) prompt.isActive = body.isActive;

    await prompt.save();

    return {
      jsonBody: { prompt },
      status: 200,
    };
  } catch (error) {
    context.error('Error updating prompt:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Delete prompt
async function deletePrompt(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const promptId = request.params.id;

    const userId = auth.sub;

    const prompt = await CustomPrompt.findOne({
      _id: promptId,
      userId: userId,
    });

    if (!prompt) {
      return {
        jsonBody: { error: 'Prompt not found' },
        status: 404,
      };
    }

    // Don't allow deleting built-in prompts
    if (prompt.isBuiltIn) {
      return {
        jsonBody: { error: 'Cannot delete built-in prompts' },
        status: 403,
      };
    }

    await prompt.deleteOne();

    return {
      jsonBody: { message: 'Prompt deleted successfully' },
      status: 200,
    };
  } catch (error) {
    context.error('Error deleting prompt:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Initialize built-in prompts for a user
async function initializeBuiltInPrompts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");

    const userId = auth.sub;

    const createdPrompts = [];

    for (const builtInPrompt of BUILT_IN_PROMPTS) {
      // Check if already exists
      const existing = await CustomPrompt.findOne({
        userId: userId,
        triggerWord: builtInPrompt.triggerWord,
      });

      if (!existing) {
        const prompt = new CustomPrompt({
          userId: userId,
          ...builtInPrompt,
        });
        await prompt.save();
        createdPrompts.push(prompt);
      }
    }

    return {
      jsonBody: {
        message: `Initialized ${createdPrompts.length} built-in prompts`,
        prompts: createdPrompts,
      },
      status: 200,
    };
  } catch (error) {
    context.error('Error initializing built-in prompts:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("getPrompts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "prompts",
  handler: getPrompts,
});

app.http("createPrompt", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "prompts",
  handler: createPrompt,
});

app.http("updatePrompt", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "prompts/{id}",
  handler: updatePrompt,
});

app.http("deletePrompt", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "prompts/{id}",
  handler: deletePrompt,
});

app.http("initializeBuiltInPrompts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "prompts/initialize",
  handler: initializeBuiltInPrompts,
});
