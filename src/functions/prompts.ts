import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { authenticateRequest } from "../middleware/auth";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";
import { MapleUser } from "../models/maple-user";

// Get all prompts for user
async function getPrompts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");

    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    const prompts = await CustomPrompt.find({ userId: user._id }).sort({ createdAt: -1 });

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

    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    // Check if trigger word already exists for this user
    const existing = await CustomPrompt.findOne({
      userId: user._id,
      triggerWord: triggerWord.toLowerCase(),
    });

    if (existing) {
      return {
        jsonBody: { error: 'Trigger word already exists' },
        status: 409,
      };
    }

    const prompt = new CustomPrompt({
      userId: user._id,
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

    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    const prompt = await CustomPrompt.findOne({
      _id: promptId,
      userId: user._id,
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
        userId: user._id,
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

    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    const prompt = await CustomPrompt.findOne({
      _id: promptId,
      userId: user._id,
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

    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    const createdPrompts = [];

    for (const builtInPrompt of BUILT_IN_PROMPTS) {
      // Check if already exists
      const existing = await CustomPrompt.findOne({
        userId: user._id,
        triggerWord: builtInPrompt.triggerWord,
      });

      if (!existing) {
        const prompt = new CustomPrompt({
          userId: user._id,
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
