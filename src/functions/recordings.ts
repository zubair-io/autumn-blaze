import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { authenticateRequest } from "../middleware/auth";
import { RecordingPaperService } from "../services/recording-paper.service";
import { Paper } from "../models/paper.model";

const SYSTEM_USER_ID = "11577eca-11f1-453f-81b3-d0bb46a995e3";

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING!
);
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "audio-recordings";

// Get all recordings for user with pagination
async function getRecordings(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");

    const userId = auth.sub;

    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    // Get papers from Paper collection
    const papers = await recordingService.listRecordings(userId);

    // Return Paper data structure directly (no transformation)
    const recordings = papers.map((paper) => ({
      recordingId: paper.data.recordingId,
      transcript: paper.data.transcript,
      duration: paper.data.duration,
      timestamp: paper.data.timestamp,
      audioUrl: paper.data.audioUrl,
      audioSyncStatus: paper.data.audioSyncStatus,
      processingHistory: paper.data.processingHistory || [],
    }));

    return {
      jsonBody: {
        recordings,
        pagination: {
          total: recordings.length,
          limit: 100,
          offset: 0,
          hasMore: false,
        },
      },
      status: 200,
    };
  } catch (error) {
    context.error('Error fetching recordings:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Get single recording by ID
async function getRecordingById(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");
    const recordingId = request.params.id;

    const userId = auth.sub;

    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    const recordingsTag = await recordingService['tagService'].getOrCreateRecordingsTag(userId);

    const paper = await Paper.findOne({
      "data.recordingId": recordingId,
      tags: recordingsTag._id,
      createdBy: userId,
    });

    if (!paper) {
      return {
        jsonBody: { error: 'Recording not found' },
        status: 404,
      };
    }

    const recording = {
      recordingId: paper.data.recordingId,
      transcript: paper.data.transcript,
      duration: paper.data.duration,
      timestamp: paper.data.timestamp,
      audioUrl: paper.data.audioUrl,
      audioSyncStatus: paper.data.audioSyncStatus,
      processingHistory: paper.data.processingHistory || [],
    };

    return {
      jsonBody: { recording },
      status: 200,
    };
  } catch (error) {
    context.error('Error fetching recording:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Delete recording
async function deleteRecording(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const recordingId = request.params.id;

    const userId = auth.sub;

    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    const recordingsTag = await recordingService['tagService'].getOrCreateRecordingsTag(userId);

    const paper = await Paper.findOne({
      "data.recordingId": recordingId,
      tags: recordingsTag._id,
      createdBy: userId,
    });

    if (!paper) {
      return {
        jsonBody: { error: 'Recording not found' },
        status: 404,
      };
    }

    // Delete audio from blob storage if it exists
    if (paper.data.audioUrl) {
      try {
        const blobName = `${userId}/${recordingId}.m4a`;
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
      } catch (blobError) {
        context.warn('Error deleting blob:', blobError);
        // Continue with database deletion even if blob deletion fails
      }
    }

    await paper.deleteOne();

    return {
      jsonBody: { message: 'Recording deleted successfully' },
      status: 200,
    };
  } catch (error) {
    context.error('Error deleting recording:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

// Get recordings with pending audio sync
async function getPendingSyncRecordings(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "read");

    const userId = auth.sub;

    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    const recordingsTag = await recordingService['tagService'].getOrCreateRecordingsTag(userId);

    const papers = await Paper.find({
      tags: recordingsTag._id,
      createdBy: userId,
      "data.audioSyncStatus": 'pending',
    })
      .sort({ "data.timestamp": 1 }) // Oldest first
      .select('data.recordingId data.timestamp data.audioSyncStatus');

    const recordings = papers.map(paper => ({
      recordingId: paper.data.recordingId,
      timestamp: paper.data.timestamp,
      audioSyncStatus: paper.data.audioSyncStatus,
    }));

    return {
      jsonBody: { recordings },
      status: 200,
    };
  } catch (error) {
    context.error('Error fetching pending sync recordings:', error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("getRecordings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "recordings",
  handler: getRecordings,
});

app.http("getRecordingById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "recordings/{id}",
  handler: getRecordingById,
});

app.http("deleteRecording", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "recordings/{id}",
  handler: deleteRecording,
});

// Reprocess recording with different prompt
async function reprocessRecording(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");
    const recordingId = request.params.id;
    const body: any = await request.json();

    const { triggerWord } = body;

    if (!triggerWord) {
      return {
        jsonBody: { error: "Missing triggerWord" },
        status: 400,
      };
    }

    const userId = auth.sub;

    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    const recordingsTag = await recordingService['tagService'].getOrCreateRecordingsTag(userId);

    // Get the recording paper
    const paper = await Paper.findOne({
      "data.recordingId": recordingId,
      tags: recordingsTag._id,
      createdBy: userId,
    });

    if (!paper) {
      return {
        jsonBody: { error: "Recording not found" },
        status: 404,
      };
    }

    // Import CustomPrompt and Anthropic
    const { CustomPrompt } = await import("../models/custom-prompt");
    const Anthropic = (await import("@anthropic-ai/sdk")).default;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Find the prompt (check both system and user prompts)
    const cleanTriggerWord = triggerWord.toLowerCase().replace(/[.,!?;:]+$/g, "");

    const matchedPrompt = await CustomPrompt.findOne({
      $or: [
        { userId: SYSTEM_USER_ID },
        { userId: userId }
      ],
      triggerWord: cleanTriggerWord,
      isActive: true,
    });

    if (!matchedPrompt) {
      return {
        jsonBody: { error: "Prompt not found" },
        status: 404,
      };
    }

    // Remove trigger word from transcript
    const cleanTranscript = paper.data.transcript.replace(
      new RegExp(`^${cleanTriggerWord}[.,!?;:]*\\s*`, "i"),
      ""
    );

    // Process with Claude
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

    const textContent = message.content.find((block) => block.type === "text");
    let processedOutput = paper.data.transcript;
    if (textContent && textContent.type === "text") {
      processedOutput = textContent.text;
    }

    const promptUsed = {
      triggerWord: matchedPrompt.triggerWord,
      promptText: matchedPrompt.promptText,
    };

    // Add to processing history using the service
    const updatedPaper = await recordingService.reprocessRecording(
      paper._id.toString(),
      userId,
      processedOutput,
      promptUsed
    );

    return {
      jsonBody: {
        recordingId: updatedPaper.data.recordingId,
        transcript: updatedPaper.data.transcript,
        duration: updatedPaper.data.duration,
        timestamp: updatedPaper.data.timestamp,
        audioUrl: updatedPaper.data.audioUrl,
        audioSyncStatus: updatedPaper.data.audioSyncStatus,
        processingHistory: updatedPaper.data.processingHistory || [],
      },
      status: 200,
    };
  } catch (error) {
    context.error("Error reprocessing recording:", error);
    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("getPendingSyncRecordings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "recordings/pending-sync",
  handler: getPendingSyncRecordings,
});

app.http("reprocessRecording", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "recordings/{id}/reprocess",
  handler: reprocessRecording,
});
