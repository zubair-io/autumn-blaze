import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";

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

    // Pagination parameters
    const limit = parseInt(request.query.get('limit') || '50', 10);
    const offset = parseInt(request.query.get('offset') || '0', 10);
    const search = request.query.get('search');

    let query: any = { userId: userId };

    // Text search if provided
    if (search) {
      query.$text = { $search: search };
    }

    const recordings = await Recording.find(query)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(Math.min(limit, 100)) // Max 100 per request
      .select('-__v');

    const total = await Recording.countDocuments(query);

    return {
      jsonBody: {
        recordings,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + recordings.length < total,
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

    const recording = await Recording.findOne({
      recordingId,
      userId: userId,
    }).select('-__v');

    if (!recording) {
      return {
        jsonBody: { error: 'Recording not found' },
        status: 404,
      };
    }

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

    const recording = await Recording.findOne({
      recordingId,
      userId: userId,
    });

    if (!recording) {
      return {
        jsonBody: { error: 'Recording not found' },
        status: 404,
      };
    }

    // Delete audio from blob storage if it exists
    if (recording.audioUrl) {
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

    await recording.deleteOne();

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

    const recordings = await Recording.find({
      userId: userId,
      audioSyncStatus: 'pending',
    })
      .sort({ timestamp: 1 }) // Oldest first
      .select('recordingId timestamp audioSyncStatus');

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

app.http("getPendingSyncRecordings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "recordings/pending-sync",
  handler: getPendingSyncRecordings,
});
