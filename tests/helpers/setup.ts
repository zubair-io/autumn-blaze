import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

beforeAll(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set by global setup');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to test database');
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  console.log('✅ Test database cleaned up');
});

beforeEach(async () => {
  // Clear all collections before each test for clean slate
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});
