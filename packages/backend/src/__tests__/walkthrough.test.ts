import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

async function tokenFor(email: string): Promise<string> {
  const res = await request(app).post('/auth/signup').send({ email, password: 'password123' });
  return res.body.token as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const sample = (over: Record<string, unknown> = {}) => ({
  name: 'Onboarding',
  origin: 'https://app.example.com',
  pathPattern: '/orders/*',
  steps: [
    {
      order: 0,
      title: 'Click New',
      description: 'Start here',
      target: { attrs: { selector: '[data-testid="new"]' } },
      advanceTrigger: { kind: 'click-target' },
    },
  ],
  ...over,
});

describe('walkthroughs auth gate', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/walkthroughs').query({ origin: 'https://x.com' });
    expect(res.status).toBe(401);
  });
});

describe('POST /walkthroughs', () => {
  it('creates a walkthrough (201), version 1, scoped to the owner', async () => {
    const t = await tokenFor('owner1@example.com');
    const res = await request(app).post('/walkthroughs').set(bearer(t)).send(sample());

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('string');
    expect(res.body.version).toBe(1);
    expect(res.body.steps).toHaveLength(1);
  });

  it('returns 400 on an invalid payload (no steps)', async () => {
    const t = await tokenFor('owner2@example.com');
    const res = await request(app).post('/walkthroughs').set(bearer(t)).send(sample({ steps: [] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /walkthroughs (list by origin/path)', () => {
  it("returns the owner's walkthroughs for an origin", async () => {
    const t = await tokenFor('list1@example.com');
    await request(app).post('/walkthroughs').set(bearer(t)).send(sample());

    const res = await request(app)
      .get('/walkthroughs')
      .query({ origin: 'https://app.example.com' })
      .set(bearer(t));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by path against the stored wildcard pattern', async () => {
    const t = await tokenFor('list2@example.com');
    await request(app).post('/walkthroughs').set(bearer(t)).send(sample({ pathPattern: '/orders/*' }));

    const match = await request(app)
      .get('/walkthroughs')
      .query({ origin: 'https://app.example.com', path: '/orders/123' })
      .set(bearer(t));
    expect(match.body).toHaveLength(1);

    const noMatch = await request(app)
      .get('/walkthroughs')
      .query({ origin: 'https://app.example.com', path: '/users/1' })
      .set(bearer(t));
    expect(noMatch.body).toHaveLength(0);
  });

  it("does not leak another user's walkthroughs", async () => {
    const a = await tokenFor('list3a@example.com');
    const b = await tokenFor('list3b@example.com');
    await request(app).post('/walkthroughs').set(bearer(a)).send(sample());

    const res = await request(app)
      .get('/walkthroughs')
      .query({ origin: 'https://app.example.com' })
      .set(bearer(b));

    expect(res.body).toHaveLength(0);
  });
});

describe('GET/PUT/DELETE /walkthroughs/:id (ownership → 403, missing → 404)', () => {
  it('owner reads (200); non-owner is forbidden (403); missing/bad id is 404', async () => {
    const a = await tokenFor('own-a@example.com');
    const b = await tokenFor('own-b@example.com');
    const created = await request(app).post('/walkthroughs').set(bearer(a)).send(sample());
    const id = created.body.id as string;

    expect((await request(app).get(`/walkthroughs/${id}`).set(bearer(a))).status).toBe(200);

    const otherRead = await request(app).get(`/walkthroughs/${id}`).set(bearer(b));
    expect(otherRead.status).toBe(403);
    expect(otherRead.body.error.code).toBe('FORBIDDEN');

    const missing = await request(app)
      .get('/walkthroughs/64b000000000000000000000')
      .set(bearer(a));
    expect(missing.status).toBe(404);

    const badId = await request(app).get('/walkthroughs/not-an-id').set(bearer(a));
    expect(badId.status).toBe(404);
  });

  it('owner updates (version bumps to 2); non-owner is forbidden', async () => {
    const a = await tokenFor('upd-a@example.com');
    const b = await tokenFor('upd-b@example.com');
    const created = await request(app).post('/walkthroughs').set(bearer(a)).send(sample());
    const id = created.body.id as string;

    const updated = await request(app)
      .put(`/walkthroughs/${id}`)
      .set(bearer(a))
      .send(sample({ name: 'Renamed' }));
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renamed');
    expect(updated.body.version).toBe(2);

    const forbidden = await request(app)
      .put(`/walkthroughs/${id}`)
      .set(bearer(b))
      .send(sample({ name: 'Hijack' }));
    expect(forbidden.status).toBe(403);
  });

  it('owner deletes (204) then it is gone (404); non-owner is forbidden', async () => {
    const a = await tokenFor('del-a@example.com');
    const b = await tokenFor('del-b@example.com');
    const created = await request(app).post('/walkthroughs').set(bearer(a)).send(sample());
    const id = created.body.id as string;

    expect((await request(app).delete(`/walkthroughs/${id}`).set(bearer(b))).status).toBe(403);
    expect((await request(app).delete(`/walkthroughs/${id}`).set(bearer(a))).status).toBe(204);
    expect((await request(app).get(`/walkthroughs/${id}`).set(bearer(a))).status).toBe(404);
  });
});
