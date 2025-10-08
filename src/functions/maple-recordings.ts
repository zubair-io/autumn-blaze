import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import Anthropic from '@anthropic-ai/sdk';
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";
import { MapleUser } from "../models/maple-user";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Process recording with Claude
async function processRecording(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const body: any = await request.json();

    const { recordingId, transcript, triggerWord, duration, timestamp } = body;

    if (!recordingId || !transcript || !duration || !timestamp) {
      return {
        jsonBody: { error: 'Missing required fields' },
        status: 400,
      };
    }

    // Get user
    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    // Find matching prompt or use default
    let matchedPrompt;
    if (triggerWord) {
      matchedPrompt = await CustomPrompt.findOne({
        userId: user._id,
        triggerWord: triggerWord.toLowerCase(),
        isActive: true,
      });
    }

    // If no match, use default prompt or just clean transcript
    if (!matchedPrompt && user.defaultPromptId) {
      matchedPrompt = await CustomPrompt.findById(user.defaultPromptId);
    }

    let processedOutput = transcript;
    let promptUsed = {
      triggerWord: triggerWord || 'none',
      promptText: 'No processing applied',
    };

    // Process with Claude if we have a prompt
    if (matchedPrompt) {
      // Remove trigger word from transcript
      const cleanTranscript = triggerWord
        ? transcript.replace(new RegExp(`^${triggerWord}\\s*`, 'i'), '')
        : transcript;

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: `${matchedPrompt.promptText}\n\nTranscript:\n${cleanTranscript}`,
          },
        ],
      });

      const textContent = message.content.find(block => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        processedOutput = textContent.text;
      }

      promptUsed = {
        triggerWord: matchedPrompt.triggerWord,
        promptText: matchedPrompt.promptText,
      };
    }

    // Save recording
    const recording = new Recording({
      recordingId,
      userId: user._id,
      transcript,
      processedOutput,
      promptUsed,
      duration,
      timestamp: new Date(timestamp),
      audioSyncStatus: 'pending',
    });

    await recording.save();

    return {
      jsonBody: {
        recordingId,
        processedOutput,
        promptUsed,
      },
      status: 200,
    };
  } catch (error) {
    context.error('Error processing recording:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("processRecording", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "recordings/process",
  handler: processRecording,
});
