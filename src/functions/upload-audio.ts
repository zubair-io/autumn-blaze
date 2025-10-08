import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";
import { MapleUser } from "../models/maple-user";

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING!
);
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "audio-recordings";

// Upload audio file to Azure Blob Storage
async function uploadAudio(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await authenticateRequest(request, "write");

    // Get user
    const user = await MapleUser.findOne({ appleUserId: auth.sub });
    if (!user) {
      return {
        jsonBody: { error: 'User not found' },
        status: 404,
      };
    }

    // Parse multipart form data
    const formData = await request.formData();
    const recordingId = formData.get('recordingId') as string;
    const audioFile = formData.get('audio') as Blob;
    const fileSize = formData.get('fileSize') as string;

    if (!recordingId || !audioFile) {
      return {
        jsonBody: { error: 'Missing recordingId or audio file' },
        status: 400,
      };
    }

    // Verify recording belongs to user
    const recording = await Recording.findOne({
      recordingId,
      userId: user._id,
    });

    if (!recording) {
      return {
        jsonBody: { error: 'Recording not found' },
        status: 404,
      };
    }

    // Upload to Azure Blob Storage
    const blobName = `${user._id}/${recordingId}.m4a`;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: 'audio/mp4',
      },
    });

    const audioUrl = blockBlobClient.url;

    // Update recording with audio URL and status
    recording.audioUrl = audioUrl;
    recording.fileSize = parseInt(fileSize, 10);
    recording.audioSyncStatus = 'uploaded';
    await recording.save();

    return {
      jsonBody: {
        recordingId,
        audioUrl,
        audioSyncStatus: 'uploaded',
      },
      status: 200,
    };
  } catch (error) {
    context.error('Error uploading audio:', error);

    // If we have the recordingId, mark as failed
    try {
      const formData = await request.formData();
      const recordingId = formData.get('recordingId') as string;
      if (recordingId) {
        await Recording.updateOne(
          { recordingId },
          { audioSyncStatus: 'failed' }
        );
      }
    } catch (updateError) {
      context.error('Error updating recording status:', updateError);
    }

    return {
      jsonBody: { error: error.message },
      status: error.status || 500,
    };
  }
}

app.http("uploadAudio", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "recordings/upload-audio",
  handler: uploadAudio,
});
