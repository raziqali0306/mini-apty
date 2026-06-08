import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Tests run against the real mongo service (mongodb-memory-server's mongod
// binary doesn't run on Alpine/musl, our image base). Derive the host from
// MONGO_URI — `mongo:27017` in Docker, `localhost:27017` locally — and force a
// dedicated test database so dev data is never touched.
const base = process.env.MONGO_URI ?? 'mongodb://localhost:27017/mini-apty';
const url = new URL(base);
url.pathname = '/mini-apty-test';
const testUri = url.toString();

// env.ts validates MONGO_URI at import; keep it consistent with what we connect to.
process.env.MONGO_URI = testUri;

beforeAll(async () => {
  await mongoose.connect(testUri);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
