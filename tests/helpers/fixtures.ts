/**
 * Test fixtures for common test data
 */

export const TEST_USERS = {
  user1: 'test-user-1',
  user2: 'test-user-2',
  admin: 'test-admin'
};

export const createRecordingData = (overrides: any = {}) => ({
  recordingId: `rec-${Date.now()}`,
  transcript: 'This is a test transcript',
  processedOutput: 'This is processed output',
  promptUsed: {
    triggerWord: 'email',
    promptText: 'Format this as a professional email'
  },
  duration: 10.5,
  timestamp: new Date(),
  ...overrides
});

export const createPromptData = (overrides: any = {}) => ({
  triggerWord: 'test',
  promptText: 'Test prompt text',
  isBuiltIn: false,
  isActive: true,
  ...overrides
});

export const createTagData = (userId: string, overrides: any = {}) => ({
  type: 'folder',
  value: 'test-tag',
  label: 'Test Tag',
  sharing: {
    sharedWith: [{
      userId,
      accessLevel: 'write'
    }],
    isPublic: false
  },
  ...overrides
});
