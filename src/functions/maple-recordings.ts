import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";
import { CustomPrompt, BUILT_IN_PROMPTS } from "../models/custom-prompt";

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
        jsonBody: { error: "Missing required fields" },
        status: 400,
      };
    }

    // Use Auth0 sub as userId directly
    const userId = auth.sub;

    // Find matching prompt in database
    let matchedPrompt;
    if (triggerWord) {
      matchedPrompt = await CustomPrompt.findOne({
        userId: userId,
        triggerWord: triggerWord.toLowerCase(),
        isActive: true,
      });

      // If not found in database, check built-in prompts
      if (!matchedPrompt) {
        const builtInPrompt = BUILT_IN_PROMPTS.find(
          (p) => p.triggerWord === triggerWord.toLowerCase()
        );
        if (builtInPrompt) {
          matchedPrompt = builtInPrompt as any;
        }
      }
    }

    let processedOutput = transcript;
    let promptUsed = {
      triggerWord: triggerWord || "none",
      promptText: "No processing applied",
    };

    // Process with Claude if we have a prompt
    if (matchedPrompt) {
      // Remove trigger word from transcript
      const cleanTranscript = triggerWord
        ? transcript.replace(new RegExp(`^${triggerWord}\\s*`, "i"), "")
        : transcript;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: `${matchedPrompt.promptText}\n\nTranscript:\n${cleanTranscript}`,
          },
        ],
      });

      const textContent = message.content.find(
        (block) => block.type === "text",
      );
      if (textContent && textContent.type === "text") {
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
      userId: userId,
      transcript,
      processedOutput,
      promptUsed,
      duration,
      timestamp: new Date(timestamp),
      audioSyncStatus: "pending",
    });

    await recording.save();
    console.log(`Recording ${recordingId} processed and saved.`);
    console.log(recordingId, processedOutput, promptUsed);

    return {
      jsonBody: {
        recordingId,
        processedOutput,
        promptUsed,
      },
      status: 200,
    };
  } catch (error) {
    context.error("Error processing recording:", error);
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
