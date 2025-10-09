import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

export async function setup() {
  console.log('🚀 Starting MongoDB Memory Server...');
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  console.log(`✅ MongoDB Memory Server started: ${uri}`);
}

export async function teardown() {
  if (mongod) {
    console.log('🛑 Stopping MongoDB Memory Server...');
    await mongod.stop();
    console.log('✅ MongoDB Memory Server stopped');
  }
}
