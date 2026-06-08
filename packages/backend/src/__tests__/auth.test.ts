import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

const app = createApp();
const creds = (email: string) => ({ email, password: 'password123' });

describe('POST /auth/signup', () => {
  it('creates a user and returns a token (no passwordHash leaked)', async () => {
    const res = await request(app).post('/auth/signup').send(creds('new@example.com'));

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('lowercases the email', async () => {
    const res = await request(app).post('/auth/signup').send(creds('MixedCase@Example.com'));
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('mixedcase@example.com');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/auth/signup').send(creds('dup@example.com'));
    const res = await request(app).post('/auth/signup').send(creds('dup@example.com'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('returns a token for valid credentials', async () => {
    await request(app).post('/auth/signup').send(creds('login@example.com'));
    const res = await request(app).post('/auth/login').send(creds('login@example.com'));

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('rejects a wrong password with 401', async () => {
    await request(app).post('/auth/signup').send(creds('wp@example.com'));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wp@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an unknown email with 401', async () => {
    const res = await request(app).post('/auth/login').send(creds('ghost@example.com'));
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const signup = await request(app).post('/auth/signup').send(creds('me@example.com'));
    const token = signup.body.token as string;

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });
});
