import { describe, it, expect, beforeEach } from 'vitest';
import { TagService } from '../../../src/services/tags.service';
import { Tag } from '../../../src/models/tag';
import { TEST_USERS } from '../../helpers/fixtures';

describe('TagService', () => {
  let tagService: TagService;

  beforeEach(async () => {
    tagService = await TagService.getInstance();
  });

  describe('getOrCreateRecordingsTag', () => {
    it('should create new recordings tag for user', async () => {
      const userId = TEST_USERS.user1;

      const tag = await tagService.getOrCreateRecordingsTag(userId);

      expect(tag.value).toBe('recordings');
      expect(tag.type).toBe('folder');
      expect(tag.label).toBe('Recordings');
      expect(tag.sharing.sharedWith).toHaveLength(1);
      expect(tag.sharing.sharedWith[0].userId).toBe(userId);
      expect(tag.sharing.sharedWith[0].accessLevel).toBe('write');
    });

    it('should return existing tag if already created', async () => {
      const userId = TEST_USERS.user1;

      const tag1 = await tagService.getOrCreateRecordingsTag(userId);
      const tag2 = await tagService.getOrCreateRecordingsTag(userId);

      expect(tag1._id.toString()).toBe(tag2._id.toString());

      // Verify only one tag exists in DB
      const allTags = await Tag.find({ value: 'recordings' });
      const userTags = allTags.filter(t =>
        t.sharing.sharedWith.some(s => s.userId === userId)
      );
      expect(userTags).toHaveLength(1);
    });

    it('should create separate tags for different users', async () => {
      const tag1 = await tagService.getOrCreateRecordingsTag(TEST_USERS.user1);
      const tag2 = await tagService.getOrCreateRecordingsTag(TEST_USERS.user2);

      expect(tag1._id.toString()).not.toBe(tag2._id.toString());

      // User 1's tag should only have user 1
      expect(tag1.sharing.sharedWith).toHaveLength(1);
      expect(tag1.sharing.sharedWith[0].userId).toBe(TEST_USERS.user1);

      // User 2's tag should only have user 2
      expect(tag2.sharing.sharedWith).toHaveLength(1);
      expect(tag2.sharing.sharedWith[0].userId).toBe(TEST_USERS.user2);
    });

    it('should not return global recordings tag', async () => {
      // Create a "global" tag that might exist from migration
      await Tag.create({
        type: 'folder',
        value: 'recordings',
        label: 'Global Recordings',
        sharing: {
          sharedWith: [],
          isPublic: false
        }
      });

      const userId = TEST_USERS.user1;
      const tag = await tagService.getOrCreateRecordingsTag(userId);

      // Should create new user-specific tag, not return global one
      expect(tag.sharing.sharedWith).toHaveLength(1);
      expect(tag.sharing.sharedWith[0].userId).toBe(userId);
    });
  });

  describe('updateTag', () => {
    it('should update tag when user has write access', async () => {
      const userId = TEST_USERS.user1;

      // Create tag
      const tag = await Tag.create({
        type: 'folder',
        value: 'test-folder',
        sharing: {
          sharedWith: [{ userId, accessLevel: 'write' }],
          isPublic: false
        }
      });

      const updated = await tagService.updateTag(
        tag._id.toString(),
        { value: 'updated-folder' },
        userId
      );

      expect(updated).not.toBeNull();
      expect(updated!.value).toBe('updated-folder');
    });

    it('should throw error when user does not have write access', async () => {
      const userId = TEST_USERS.user1;
      const otherUser = TEST_USERS.user2;

      // Create tag owned by user1
      const tag = await Tag.create({
        type: 'folder',
        value: 'test-folder',
        sharing: {
          sharedWith: [{ userId, accessLevel: 'write' }],
          isPublic: false
        }
      });

      // Try to update as user2
      await expect(
        tagService.updateTag(tag._id.toString(), { value: 'hacked' }, otherUser)
      ).rejects.toThrow('Tag not found or user does not have write access');
    });

    it('should throw error when user has read-only access', async () => {
      const owner = TEST_USERS.user1;
      const reader = TEST_USERS.user2;

      // Create tag with owner and reader
      const tag = await Tag.create({
        type: 'folder',
        value: 'test-folder',
        sharing: {
          sharedWith: [
            { userId: owner, accessLevel: 'write' },
            { userId: reader, accessLevel: 'read' }
          ],
          isPublic: false
        }
      });

      // Reader should not be able to update
      await expect(
        tagService.updateTag(tag._id.toString(), { value: 'hacked' }, reader)
      ).rejects.toThrow('Tag not found or user does not have write access');
    });
  });

  describe('createTag', () => {
    it('should create tag with user as owner', async () => {
      const userId = TEST_USERS.user1;

      const tag = await tagService.createTag(userId, {
        type: 'folder',
        value: 'my-folder'
      });

      expect(tag.type).toBe('folder');
      expect(tag.value).toBe('my-folder');
      expect(tag.sharing.sharedWith).toHaveLength(1);
      expect(tag.sharing.sharedWith[0].userId).toBe(userId);
      expect(tag.sharing.sharedWith[0].accessLevel).toBe('write');
    });
  });

  describe('listUserTags', () => {
    it('should return user tags', async () => {
      const userId = TEST_USERS.user1;

      // Create multiple tags
      await tagService.createTag(userId, { type: 'folder', value: 'folder1' });
      await tagService.createTag(userId, { type: 'folder', value: 'folder2' });

      const tags = await tagService.listUserTags(userId);

      expect(tags.length).toBeGreaterThanOrEqual(2);
      expect(tags.every(t =>
        t.sharing.sharedWith.some(s => s.userId === userId)
      )).toBe(true);
    });

    it('should create default tag if user has no tags', async () => {
      const userId = TEST_USERS.user1;

      const tags = await tagService.listUserTags(userId);

      expect(tags).toHaveLength(1);
      expect(tags[0].value).toBe('Lego');
      expect(tags[0].type).toBe('folder');
    });

    it('should not return other users tags', async () => {
      const user1 = TEST_USERS.user1;
      const user2 = TEST_USERS.user2;

      // Create tag for user1
      await tagService.createTag(user1, { type: 'folder', value: 'user1-folder' });

      // Get user2's tags
      const tags = await tagService.listUserTags(user2);

      // Should only have default tag, not user1's tag
      expect(tags.every(t => t.value !== 'user1-folder')).toBe(true);
    });
  });
});
