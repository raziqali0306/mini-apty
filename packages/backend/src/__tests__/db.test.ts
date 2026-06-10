import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';

/**
 * Connection-pool lifecycle owned by `config/db.ts` (the seam `index.ts` wires to
 * SIGTERM/SIGINT for graceful shutdown). The shared test connection is already
 * open via the setup file; here we drain it and reopen it, leaving it connected
 * for the suite's per-test cleanup.
 *
 * readyState: 0 = disconnected, 1 = connected.
 */
describe('db lifecycle', () => {
  it('drains the pool on disconnect and reopens it on connect', async () => {
    expect(mongoose.connection.readyState).toBe(1); // opened by setup.ts

    await disconnectDb();
    expect(mongoose.connection.readyState).toBe(0);

    await connectDb();
    expect(mongoose.connection.readyState).toBe(1);
  });
});
