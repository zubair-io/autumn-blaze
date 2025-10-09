import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { authenticateRequest } from "../middleware/auth";
import { Recording } from "../models/recording";
import { RecordingPaperService } from "../services/recording-paper.service";

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

    const userId = auth.sub;

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

    // Upload to Azure Blob Storage
    const blobName = `${userId}/${recordingId}.m4a`;
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

    // Update recording with audio URL and status using Paper service
    const recordingService = new RecordingPaperService();
    await recordingService.initialize();

    await recordingService.updateAudioStatus(
      recordingId,
      userId,
      'uploaded',
      audioUrl
    );

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
        const recordingService = new RecordingPaperService();
        await recordingService.initialize();
        await recordingService.updateAudioStatus(
          recordingId,
          auth.sub,
          'failed'
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
