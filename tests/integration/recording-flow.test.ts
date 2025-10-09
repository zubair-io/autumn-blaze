import { describe, it, expect } from 'vitest';
import { RecordingPaperService } from '../../src/services/recording-paper.service';
import { TagService } from '../../src/services/tags.service';
import { Paper } from '../../src/models/paper.model';
import { Tag } from '../../src/models/tag';
import { TEST_USERS, createRecordingData } from '../helpers/fixtures';

describe('Recording Flow Integration', () => {
  describe('Complete recording lifecycle', () => {
    it('should handle full recording flow: create -> list -> reprocess -> delete', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      // 1. Create recording
      const recordingData = createRecordingData({
        recordingId: 'rec-lifecycle-001',
        transcript: 'Send email to John about the meeting tomorrow',
        processedOutput: 'Subject: Meeting Tomorrow\n\nHi John...',
        promptUsed: {
          triggerWord: 'email',
          promptText: 'Format as professional email'
        }
      });

      const paper = await service.createRecording(userId, recordingData);
      expect(paper.data.recordingId).toBe('rec-lifecycle-001');
      expect(paper.data.processingHistory).toHaveLength(1);

      // 2. List recordings
      const recordings = await service.listRecordings(userId);
      expect(recordings).toHaveLength(1);
      expect(recordings[0].data.recordingId).toBe('rec-lifecycle-001');

      // 3. Reprocess with different prompt
      const reprocessed = await service.reprocessRecording(
        paper._id.toString(),
        userId,
        '- Meeting tomorrow\n- Send to John',
        { triggerWord: 'notes', promptText: 'Format as bullet points' }
      );

      expect(reprocessed.data.processingHistory).toHaveLength(2);
      expect(reprocessed.data.processingHistory[1].promptUsed.triggerWord).toBe('notes');

      // 4. Update audio status
      await service.updateAudioStatus(
        'rec-lifecycle-001',
        userId,
        'uploaded',
        'https://blob.storage/audio.m4a'
      );

      const updated = await Paper.findById(paper._id);
      expect(updated!.data.audioSyncStatus).toBe('uploaded');
      expect(updated!.data.audioUrl).toBe('https://blob.storage/audio.m4a');

      // 5. Delete recording
      await Paper.deleteOne({ _id: paper._id });

      const afterDelete = await service.listRecordings(userId);
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('Multi-user isolation', () => {
    it('should maintain complete isolation between users', async () => {
      const user1 = TEST_USERS.user1;
      const user2 = TEST_USERS.user2;
      const service = new RecordingPaperService();
      await service.initialize();

      // User 1 creates recordings
      const user1Recording1 = await service.createRecording(user1, createRecordingData({
        recordingId: 'user1-rec1',
        transcript: 'User 1 recording 1'
      }));

      await service.createRecording(user1, createRecordingData({
        recordingId: 'user1-rec2',
        transcript: 'User 1 recording 2'
      }));

      // User 2 creates recordings
      const user2Recording1 = await service.createRecording(user2, createRecordingData({
        recordingId: 'user2-rec1',
        transcript: 'User 2 recording 1'
      }));

      // List recordings for each user
      const user1Recordings = await service.listRecordings(user1);
      const user2Recordings = await service.listRecordings(user2);

      expect(user1Recordings).toHaveLength(2);
      expect(user2Recordings).toHaveLength(1);

      // Verify content isolation
      expect(user1Recordings.every(r => r.data.transcript.includes('User 1'))).toBe(true);
      expect(user2Recordings.every(r => r.data.transcript.includes('User 2'))).toBe(true);

      // User 2 should not be able to reprocess User 1's recording
      await expect(
        service.reprocessRecording(
          user1Recording1._id.toString(),
          user2,
          'Hacked output',
          { triggerWord: 'hack', promptText: 'Hack' }
        )
      ).rejects.toThrow('Recording not found or access denied');

      // User 2 should not be able to update User 1's audio status
      await service.updateAudioStatus('user1-rec1', user2, 'uploaded', 'https://hacked.com/audio');

      const user1Rec = await Paper.findById(user1Recording1._id);
      expect(user1Rec!.data.audioSyncStatus).toBe('pending'); // Should still be pending

      // Verify separate tags were created
      const user1Tag = await Tag.findOne({
        type: 'folder',
        value: 'recordings',
        'sharing.sharedWith': { $elemMatch: { userId: user1 } }
      });

      const user2Tag = await Tag.findOne({
        type: 'folder',
        value: 'recordings',
        'sharing.sharedWith': { $elemMatch: { userId: user2 } }
      });

      expect(user1Tag!._id.toString()).not.toBe(user2Tag!._id.toString());
    });
  });

  describe('Processing history accumulation', () => {
    it('should accumulate processing history across multiple reprocesses', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      const paper = await service.createRecording(userId, createRecordingData({
        recordingId: 'history-test',
        transcript: 'Meeting with team about Q4 goals',
        processedOutput: 'Initial email format',
        promptUsed: { triggerWord: 'email', promptText: 'Format as email' }
      }));

      // Reprocess with different prompts
      const prompts = [
        { trigger: 'notes', text: 'Format as notes', output: 'Bullet point notes' },
        { trigger: 'summary', text: 'Summarize', output: 'Brief summary' },
        { trigger: 'todo', text: 'Extract todos', output: 'Todo list' },
        { trigger: 'clean', text: 'Clean transcript', output: 'Cleaned text' }
      ];

      for (const prompt of prompts) {
        await service.reprocessRecording(
          paper._id.toString(),
          userId,
          prompt.output,
          { triggerWord: prompt.trigger, promptText: prompt.text }
        );
      }

      const final = await Paper.findById(paper._id);
      expect(final!.data.processingHistory).toHaveLength(5); // 1 initial + 4 reprocesses

      // Verify order
      expect(final!.data.processingHistory[0].promptUsed.triggerWord).toBe('email');
      expect(final!.data.processingHistory[1].promptUsed.triggerWord).toBe('notes');
      expect(final!.data.processingHistory[2].promptUsed.triggerWord).toBe('summary');
      expect(final!.data.processingHistory[3].promptUsed.triggerWord).toBe('todo');
      expect(final!.data.processingHistory[4].promptUsed.triggerWord).toBe('clean');

      // Verify latest is correct
      const latest = service.getLatestProcessedOutput(final!);
      expect(latest!.output).toBe('Cleaned text');
      expect(latest!.promptUsed.triggerWord).toBe('clean');
    });
  });

  describe('Tag-based permissions', () => {
    it('should enforce tag-based access control', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      // Create recording (creates tag automatically)
      const paper = await service.createRecording(userId, createRecordingData());

      // Verify tag was created with correct permissions
      const tag = await Tag.findOne({
        _id: { $in: paper.tags }
      });

      expect(tag).not.toBeNull();
      expect(tag!.type).toBe('folder');
      expect(tag!.value).toBe('recordings');
      expect(tag!.sharing.sharedWith).toHaveLength(1);
      expect(tag!.sharing.sharedWith[0].userId).toBe(userId);
      expect(tag!.sharing.sharedWith[0].accessLevel).toBe('write');

      // Verify paper is associated with tag
      expect(paper.tags).toHaveLength(1);
      expect(paper.tags[0].toString()).toBe(tag!._id.toString());

      // Verify paper has correct owner
      expect(paper.createdBy).toBe(userId);
    });

    it('should reuse same tag for multiple recordings', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      // Create multiple recordings
      const recordings = [];
      for (let i = 0; i < 5; i++) {
        const paper = await service.createRecording(userId, createRecordingData({
          recordingId: `rec-${i}`
        }));
        recordings.push(paper);
      }

      // All should share the same tag
      const tagIds = recordings.map(r => r.tags[0].toString());
      const uniqueTagIds = new Set(tagIds);
      expect(uniqueTagIds.size).toBe(1);

      // Verify only one recordings tag exists for user
      const tags = await Tag.find({
        type: 'folder',
        value: 'recordings',
        'sharing.sharedWith': { $elemMatch: { userId } }
      });

      expect(tags).toHaveLength(1);
    });
  });

  describe('Audio sync workflow', () => {
    it('should handle audio upload workflow', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      // Create recording (starts with pending status)
      const recordingData = createRecordingData({
        recordingId: 'audio-test-001'
      });

      const paper = await service.createRecording(userId, recordingData);
      expect(paper.data.audioSyncStatus).toBe('pending');
      expect(paper.data.audioUrl).toBeNull();

      // Simulate successful audio upload
      await service.updateAudioStatus(
        'audio-test-001',
        userId,
        'uploaded',
        'https://blob.storage/user123/audio-test-001.m4a'
      );

      let updated = await Paper.findById(paper._id);
      expect(updated!.data.audioSyncStatus).toBe('uploaded');
      expect(updated!.data.audioUrl).toBe('https://blob.storage/user123/audio-test-001.m4a');

      // Simulate failed upload scenario
      const failedRecording = await service.createRecording(userId, createRecordingData({
        recordingId: 'audio-test-002'
      }));

      await service.updateAudioStatus('audio-test-002', userId, 'failed');

      updated = await Paper.findById(failedRecording._id);
      expect(updated!.data.audioSyncStatus).toBe('failed');
      expect(updated!.data.audioUrl).toBeNull();
    });

    it('should query pending sync recordings', async () => {
      const userId = TEST_USERS.user1;
      const service = new RecordingPaperService();
      await service.initialize();

      // Create mix of recordings
      await service.createRecording(userId, createRecordingData({ recordingId: 'rec-1' })); // pending
      await service.createRecording(userId, createRecordingData({ recordingId: 'rec-2' })); // pending

      const rec3 = await service.createRecording(userId, createRecordingData({ recordingId: 'rec-3' }));
      await service.updateAudioStatus('rec-3', userId, 'uploaded', 'https://blob/rec-3.m4a');

      const rec4 = await service.createRecording(userId, createRecordingData({ recordingId: 'rec-4' }));
      await service.updateAudioStatus('rec-4', userId, 'failed');

      // Query pending recordings
      const tagService = await TagService.getInstance();
      const recordingsTag = await tagService.getOrCreateRecordingsTag(userId);

      const pending = await Paper.find({
        tags: recordingsTag._id,
        createdBy: userId,
        'data.audioSyncStatus': 'pending'
      });

      expect(pending).toHaveLength(2);
      expect(pending.every(p => p.data.audioSyncStatus === 'pending')).toBe(true);
    });
  });
});
