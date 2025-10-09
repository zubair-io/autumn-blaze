import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";
import { CustomPrompt } from "../models/custom-prompt";
import { RecordingPaperService } from "../services/recording-paper.service";

const SYSTEM_USER_ID = "11577eca-11f1-453f-81b3-d0bb46a995e3";

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

    // Smart prompt matching - check beginning of transcript for trigger words
    let matchedPrompt;
    let matchedTriggerWord: string | null = null;

    // Get all active prompts (both system and user's custom prompts)
    const allAvailablePrompts = await CustomPrompt.find({
      $or: [
        { userId: SYSTEM_USER_ID }, // System default prompts
        { userId: userId }           // User's custom prompts
      ],
      isActive: true,
    });

    // Normalize transcript
    const normalizedTranscript = transcript.toLowerCase().replace(/^[.,!?;:]+/g, '').trim();

    // Sort prompts by trigger word length (longest first) to match "to do" before "to"
    const sortedPrompts = allAvailablePrompts.sort((a, b) =>
      b.triggerWord.length - a.triggerWord.length
    );

    // Find first matching prompt
    for (const prompt of sortedPrompts) {
      const triggerPattern = prompt.triggerWord.toLowerCase().replace(/[.,!?;:]+$/g, '');
      // Check if transcript starts with this trigger word (with optional punctuation after)
      const regex = new RegExp(`^${triggerPattern}[.,!?;:\\s]`, 'i');
      if (normalizedTranscript.startsWith(triggerPattern + ' ') ||
          normalizedTranscript.startsWith(triggerPattern + '.') ||
          normalizedTranscript.startsWith(triggerPattern + ',') ||
          normalizedTranscript.startsWith(triggerPattern + '!') ||
          normalizedTranscript.startsWith(triggerPattern + '?') ||
          normalizedTranscript === triggerPattern) {
        matchedPrompt = prompt;
        matchedTriggerWord = triggerPattern;
        context.log(`Matched trigger word: "${triggerPattern}"`);
        break;
      }
    }

    // Fallback to original triggerWord parameter if provided and no match found
    if (!matchedPrompt && triggerWord) {
      const cleanTriggerWord = triggerWord.toLowerCase().replace(/[.,!?;:]+$/g, '');
      matchedPrompt = await CustomPrompt.findOne({
        $or: [
          { userId: SYSTEM_USER_ID },
          { userId: userId }
        ],
        triggerWord: cleanTriggerWord,
        isActive: true,
      });

      if (matchedPrompt) {
        matchedTriggerWord = cleanTriggerWord;
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
      const cleanTranscript = matchedTriggerWord
        ? transcript.replace(new RegExp(`^${matchedTriggerWord.replace(/[.,!?;:]+$/g, '')}[.,!?;:]*\\s*`, "i"), "")
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

    // Save recording in Paper collection
    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    const paper = await recordingService.createRecording(userId, {
      recordingId,
      transcript,
      processedOutput,
      promptUsed,
      duration,
      timestamp: new Date(timestamp),
    });

    console.log(`Recording ${recordingId} processed and saved to Paper.`);
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
