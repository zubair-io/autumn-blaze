import { describe, it, expect, beforeEach } from 'vitest';
import { RecordingPaperService } from '../../../src/services/recording-paper.service';
import { Paper } from '../../../src/models/paper.model';
import { Tag } from '../../../src/models/tag';
import { TEST_USERS, createRecordingData } from '../../helpers/fixtures';

describe('RecordingPaperService', () => {
  let service: RecordingPaperService;

  beforeEach(async () => {
    service = new RecordingPaperService();
    await service.initialize();
  });

  describe('createRecording', () => {
    it('should create recording in Paper collection', async () => {
      const userId = TEST_USERS.user1;
      const recordingData = createRecordingData();

      const paper = await service.createRecording(userId, recordingData);

      expect(paper).toBeDefined();
      expect(paper.data.recordingId).toBe(recordingData.recordingId);
      expect(paper.data.transcript).toBe(recordingData.transcript);
      expect(paper.data.duration).toBe(recordingData.duration);
      expect(paper.data.audioSyncStatus).toBe('pending');
      expect(paper.createdBy).toBe(userId);
    });

    it('should create processingHistory with initial entry', async () => {
      const userId = TEST_USERS.user1;
      const recordingData = createRecordingData({
        processedOutput: 'Initial processed output',
        promptUsed: {
          triggerWord: 'email',
          promptText: 'Format as email'
        }
      });

      const paper = await service.createRecording(userId, recordingData);

      expect(paper.data.processingHistory).toHaveLength(1);
      expect(paper.data.processingHistory[0].output).toBe('Initial processed output');
      expect(paper.data.processingHistory[0].promptUsed.triggerWord).toBe('email');
      expect(paper.data.processingHistory[0].promptUsed.promptText).toBe('Format as email');
      expect(paper.data.processingHistory[0].processedAt).toBeInstanceOf(Date);
    });

    it('should create and associate recordings tag', async () => {
      const userId = TEST_USERS.user1;
      const recordingData = createRecordingData();

      const paper = await service.createRecording(userId, recordingData);

      // Check tag was created
      const tags = await Tag.find({
        type: 'folder',
        value: 'recordings',
        'sharing.sharedWith': {
          $elemMatch: { userId }
        }
      });

      expect(tags).toHaveLength(1);
      expect(paper.tags).toHaveLength(1);
      expect(paper.tags[0].toString()).toBe(tags[0]._id.toString());
    });

    it('should reuse existing recordings tag', async () => {
      const userId = TEST_USERS.user1;

      // Create first recording
      await service.createRecording(userId, createRecordingData());

      // Create second recording
      const paper2 = await service.createRecording(userId, createRecordingData());

      // Should only have one recordings tag
      const tags = await Tag.find({
        type: 'folder',
        value: 'recordings',
        'sharing.sharedWith': {
          $elemMatch: { userId }
        }
      });

      expect(tags).toHaveLength(1);
      expect(paper2.tags[0].toString()).toBe(tags[0]._id.toString());
    });
  });

  describe('listRecordings', () => {
    it('should return user recordings sorted by timestamp descending', async () => {
      const userId = TEST_USERS.user1;

      // Create recordings with different timestamps
      const rec1 = await service.createRecording(userId, createRecordingData({
        timestamp: new Date('2025-10-09T10:00:00Z')
      }));

      const rec2 = await service.createRecording(userId, createRecordingData({
        timestamp: new Date('2025-10-09T11:00:00Z')
      }));

      const rec3 = await service.createRecording(userId, createRecordingData({
        timestamp: new Date('2025-10-09T09:00:00Z')
      }));

      const recordings = await service.listRecordings(userId);

      expect(recordings).toHaveLength(3);
      // Most recent first
      expect(recordings[0]._id.toString()).toBe(rec2._id.toString());
      expect(recordings[1]._id.toString()).toBe(rec1._id.toString());
      expect(recordings[2]._id.toString()).toBe(rec3._id.toString());
    });

    it('should only return recordings for specific user', async () => {
      const user1 = TEST_USERS.user1;
      const user2 = TEST_USERS.user2;

      await service.createRecording(user1, createRecordingData());
      await service.createRecording(user1, createRecordingData());
      await service.createRecording(user2, createRecordingData());

      const user1Recordings = await service.listRecordings(user1);
      const user2Recordings = await service.listRecordings(user2);

      expect(user1Recordings).toHaveLength(2);
      expect(user2Recordings).toHaveLength(1);

      // Verify user1 can't see user2's recordings
      expect(user1Recordings.every(r => r.createdBy === user1)).toBe(true);
      expect(user2Recordings.every(r => r.createdBy === user2)).toBe(true);
    });

    it('should return empty array if user has no recordings', async () => {
      const userId = TEST_USERS.user1;
      const recordings = await service.listRecordings(userId);
      expect(recordings).toHaveLength(0);
    });

    it('should limit to 100 recordings', async () => {
      const userId = TEST_USERS.user1;

      // Create 105 recordings
      for (let i = 0; i < 105; i++) {
        await service.createRecording(userId, createRecordingData({
          recordingId: `rec-${i}`
        }));
      }

      const recordings = await service.listRecordings(userId);
      expect(recordings).toHaveLength(100);
    });
  });

  describe('reprocessRecording', () => {
    it('should add new entry to processingHistory', async () => {
      const userId = TEST_USERS.user1;

      const paper = await service.createRecording(userId, createRecordingData({
        processedOutput: 'Original output',
        promptUsed: { triggerWord: 'email', promptText: 'Format as email' }
      }));

      expect(paper.data.processingHistory).toHaveLength(1);

      const updated = await service.reprocessRecording(
        paper._id.toString(),
        userId,
        'New output from summary',
        { triggerWord: 'summary', promptText: 'Summarize this' }
      );

      expect(updated.data.processingHistory).toHaveLength(2);
      expect(updated.data.processingHistory[0].output).toBe('Original output');
      expect(updated.data.processingHistory[1].output).toBe('New output from summary');
      expect(updated.data.processingHistory[1].promptUsed.triggerWord).toBe('summary');
    });

    it('should preserve existing history when reprocessing', async () => {
      const userId = TEST_USERS.user1;

      const paper = await service.createRecording(userId, createRecordingData());

      // Reprocess multiple times
      await service.reprocessRecording(
        paper._id.toString(),
        userId,
        'Output 2',
        { triggerWord: 'notes', promptText: 'Format as notes' }
      );

      const updated = await service.reprocessRecording(
        paper._id.toString(),
        userId,
        'Output 3',
        { triggerWord: 'todo', promptText: 'Extract todos' }
      );

      expect(updated.data.processingHistory).toHaveLength(3);
      expect(updated.data.processingHistory[0].promptUsed.triggerWord).toBe('email');
      expect(updated.data.processingHistory[1].promptUsed.triggerWord).toBe('notes');
      expect(updated.data.processingHistory[2].promptUsed.triggerWord).toBe('todo');
    });

    it('should throw error if user does not own recording', async () => {
      const user1 = TEST_USERS.user1;
      const user2 = TEST_USERS.user2;

      const paper = await service.createRecording(user1, createRecordingData());

      await expect(
        service.reprocessRecording(
          paper._id.toString(),
          user2,
          'Hacked output',
          { triggerWord: 'hack', promptText: 'Hack this' }
        )
      ).rejects.toThrow('Recording not found or access denied');
    });

    it('should throw error if recording does not exist', async () => {
      const userId = TEST_USERS.user1;
      const fakeId = '507f1f77bcf86cd799439011'; // Valid ObjectId format

      await expect(
        service.reprocessRecording(
          fakeId,
          userId,
          'Output',
          { triggerWord: 'test', promptText: 'Test' }
        )
      ).rejects.toThrow('Recording not found or access denied');
    });
  });

  describe('updateAudioStatus', () => {
    it('should update audio status and URL', async () => {
      const userId = TEST_USERS.user1;
      const recordingData = createRecordingData();

      await service.createRecording(userId, recordingData);

      await service.updateAudioStatus(
        recordingData.recordingId,
        userId,
        'uploaded',
        'https://blob.storage/user123/rec-001.m4a'
      );

      const papers = await service.listRecordings(userId);
      expect(papers).toHaveLength(1);
      expect(papers[0].data.audioSyncStatus).toBe('uploaded');
      expect(papers[0].data.audioUrl).toBe('https://blob.storage/user123/rec-001.m4a');
    });

    it('should update status without URL', async () => {
      const userId = TEST_USERS.user1;
      const recordingData = createRecordingData();

      await service.createRecording(userId, recordingData);

      await service.updateAudioStatus(
        recordingData.recordingId,
        userId,
        'failed'
      );

      const papers = await service.listRecordings(userId);
      expect(papers[0].data.audioSyncStatus).toBe('failed');
      expect(papers[0].data.audioUrl).toBeNull();
    });

    it('should not update other users recordings', async () => {
      const user1 = TEST_USERS.user1;
      const user2 = TEST_USERS.user2;
      const recordingData = createRecordingData();

      await service.createRecording(user1, recordingData);

      // User2 tries to update user1's recording
      await service.updateAudioStatus(
        recordingData.recordingId,
        user2,
        'uploaded',
        'https://hacked.com/audio.m4a'
      );

      // User1's recording should still be pending
      const user1Recordings = await service.listRecordings(user1);
      expect(user1Recordings[0].data.audioSyncStatus).toBe('pending');
      expect(user1Recordings[0].data.audioUrl).toBeNull();
    });
  });

  describe('getLatestProcessedOutput', () => {
    it('should return latest entry from processingHistory', async () => {
      const userId = TEST_USERS.user1;

      const paper = await service.createRecording(userId, createRecordingData({
        processedOutput: 'Output 1',
        promptUsed: { triggerWord: 'email', promptText: 'Format as email' }
      }));

      await service.reprocessRecording(
        paper._id.toString(),
        userId,
        'Output 2',
        { triggerWord: 'notes', promptText: 'Format as notes' }
      );

      const updatedPaper = await Paper.findById(paper._id);
      const latest = service.getLatestProcessedOutput(updatedPaper!);

      expect(latest).not.toBeNull();
      expect(latest!.output).toBe('Output 2');
      expect(latest!.promptUsed.triggerWord).toBe('notes');
    });

    it('should return null if no processing history', async () => {
      const paper = await Paper.create({
        tags: [],
        type: 'recording',
        createdBy: TEST_USERS.user1,
        data: {
          recordingId: 'rec-001',
          transcript: 'Test',
          duration: 5,
          timestamp: new Date()
        }
      });

      const latest = service.getLatestProcessedOutput(paper);
      expect(latest).toBeNull();
    });

    it('should return first entry if only one exists', async () => {
      const userId = TEST_USERS.user1;

      const paper = await service.createRecording(userId, createRecordingData({
        processedOutput: 'Only output',
        promptUsed: { triggerWord: 'test', promptText: 'Test prompt' }
      }));

      const latest = service.getLatestProcessedOutput(paper);
      expect(latest!.output).toBe('Only output');
    });
  });
});
