import { Paper, IPaper } from "../models/paper.model";
import { TagService } from "./tags.service";

export class RecordingPaperService {
  private tagService: TagService;

  async initialize(): Promise<void> {
    this.tagService = await TagService.getInstance();
  }

  /**
   * Create a new recording in Paper collection
   */
  async createRecording(
    userId: string,
    recordingData: {
      recordingId: string;
      transcript: string;
      processedOutput: string;
      promptUsed: { triggerWord: string; promptText: string };
      duration: number;
      timestamp: Date;
      audioUrl?: string;
    },
  ): Promise<IPaper> {
    // Get/create _recordings tag and add user
    const recordingsTag =
      await this.tagService.getOrCreateRecordingsTag(userId);

    // Create paper with recording data
    const paper = await Paper.create({
      tags: [recordingsTag._id],
      createdBy: userId,
      data: {
        recordingId: recordingData.recordingId,
        transcript: recordingData.transcript,
        duration: recordingData.duration,
        timestamp: recordingData.timestamp,
        audioUrl: recordingData.audioUrl || null,
        audioSyncStatus: "pending",
        processingHistory: [
          {
            processedAt: new Date(),
            promptUsed: recordingData.promptUsed,
            output: recordingData.processedOutput,
          },
        ],
      },
    });

    return paper;
  }

  /**
   * Get all recordings for a user
   */
  async listRecordings(userId: string): Promise<IPaper[]> {
    const recordingsTag =
      await this.tagService.getOrCreateRecordingsTag(userId);

    const papers = await Paper.find({
      tags: recordingsTag._id,
      createdBy: userId,
    })
      .sort({ "data.timestamp": -1 })
      .limit(100);

    return papers;
  }

  /**
   * Reprocess a recording with a new prompt
   * Adds new entry to processingHistory array
   */
  async reprocessRecording(
    paperId: string,
    userId: string,
    newOutput: string,
    promptUsed: { triggerWord: string; promptText: string },
  ): Promise<IPaper> {
    const paper = await Paper.findById(paperId);

    if (!paper || paper.createdBy !== userId) {
      throw new Error("Recording not found or access denied");
    }

    // Add to processing history (no redundant root fields)
    if (!paper.data.processingHistory) {
      paper.data.processingHistory = [];
    }

    paper.data.processingHistory.push({
      processedAt: new Date(),
      promptUsed,
      output: newOutput,
    });

    paper.markModified("data");
    await paper.save();
    return paper;
  }

  /**
   * Update audio sync status
   */
  async updateAudioStatus(
    recordingId: string,
    userId: string,
    status: "pending" | "uploaded" | "failed",
    audioUrl?: string,
  ): Promise<void> {
    const recordingsTag =
      await this.tagService.getOrCreateRecordingsTag(userId);

    const updateData: any = {
      "data.audioSyncStatus": status,
    };

    if (audioUrl) {
      updateData["data.audioUrl"] = audioUrl;
    }

    await Paper.updateOne(
      {
        "data.recordingId": recordingId,
        tags: recordingsTag._id,
        createdBy: userId,
      },
      {
        $set: updateData,
      },
    );
  }

  /**
   * Get latest processed output for a recording
   */
  getLatestProcessedOutput(paper: IPaper): {
    output: string;
    promptUsed: { triggerWord: string; promptText: string };
    processedAt: Date;
  } | null {
    if (
      !paper.data.processingHistory ||
      paper.data.processingHistory.length === 0
    ) {
      return null;
    }

    // Get last item in array
    const latest =
      paper.data.processingHistory[paper.data.processingHistory.length - 1];
    return latest;
  }
}
