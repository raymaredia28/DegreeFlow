import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import supertest from 'supertest';
import { createApp } from '../dist/app.js';

const app = createApp();
const request = supertest(app);
const AUTH = 'Bearer test-user-storage';
const dbPath = process.env.LOCAL_DB_PATH || '/tmp/degreeflow-test-db.json';

describe('Storage routes', () => {
  before(async () => {
    await fs.unlink(dbPath).catch(() => {});
  });

  after(async () => {
    await fs.unlink(dbPath).catch(() => {});
  });

  describe('POST /storage/login', () => {
    it('creates student and returns data on first login', async () => {
      const res = await request
        .post('/storage/login')
        .set('Authorization', AUTH)
        .send({ email: 'storage@example.com', name: 'Storage User' });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.studentId);
      assert.ok(res.body.student);
      assert.strictEqual(res.body.transcript, null);
      assert.strictEqual(res.body.planner, null);
    });

    it('falls through to dev-user when no auth header (dev mode)', async () => {
      const res = await request
        .post('/storage/login')
        .send({});
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.studentId);
    });

    it('returns existing data on subsequent logins', async () => {
      const res = await request
        .post('/storage/login')
        .set('Authorization', AUTH)
        .send({});

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.studentId);
    });
  });

  describe('POST /storage/transcript', () => {
    it('saves transcript terms', async () => {
      const res = await request
        .post('/storage/transcript')
        .set('Authorization', AUTH)
        .send({
          terms: [
            {
              label: 'Fall 2024',
              status: 'completed',
              courses: [
                { code: 'CSCE 120', title: 'Program Design', credits: 3, grade: 'A' }
              ]
            }
          ]
        });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.studentId);
    });

    it('rejects invalid transcript payload', async () => {
      const res = await request
        .post('/storage/transcript')
        .set('Authorization', AUTH)
        .send({ terms: 'not-an-array' });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.issues);
    });

    it('rejects transcript with invalid course schema', async () => {
      const res = await request
        .post('/storage/transcript')
        .set('Authorization', AUTH)
        .send({
          terms: [{
            label: 'Fall 2024',
            status: 'completed',
            courses: [{ invalid: true }]
          }]
        });
      assert.strictEqual(res.status, 400);
    });

    it('falls through to dev-user when no auth (dev mode)', async () => {
      const res = await request
        .post('/storage/transcript')
        .send({ terms: [] });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('GET /storage/transcript/:studentId', () => {
    it('retrieves saved transcript', async () => {
      const loginRes = await request
        .post('/storage/login')
        .set('Authorization', AUTH)
        .send({});
      const studentId = loginRes.body.studentId;

      const res = await request
        .get(`/storage/transcript/${studentId}`)
        .set('Authorization', AUTH);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.terms));
      assert.strictEqual(res.body.terms[0].label, 'Fall 2024');
    });

    it('returns 404 for student with no transcript', async () => {
      const otherAuth = 'Bearer no-transcript-user';
      await request
        .post('/storage/login')
        .set('Authorization', otherAuth)
        .send({});

      const res = await request
        .get('/storage/transcript/no-transcript-user')
        .set('Authorization', otherAuth);

      assert.strictEqual(res.status, 404);
    });

    it('returns 403 when dev-user uid mismatches studentId param', async () => {
      const res = await request.get('/storage/transcript/some-id');
      assert.strictEqual(res.status, 403);
    });
  });

  describe('POST /storage/planner/:studentId', () => {
    it('saves planner state', async () => {
      const loginRes = await request
        .post('/storage/login')
        .set('Authorization', AUTH)
        .send({});
      const studentId = loginRes.body.studentId;

      const payload = { semesters: [{ name: 'Fall 2025', courses: [] }] };
      const res = await request
        .post(`/storage/planner/${studentId}`)
        .set('Authorization', AUTH)
        .send(payload);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.payload);
    });

    it('returns 403 when dev-user uid mismatches studentId param', async () => {
      const res = await request
        .post('/storage/planner/some-id')
        .send({});
      assert.strictEqual(res.status, 403);
    });
  });

  describe('GET /storage/planner/:studentId', () => {
    it('retrieves saved planner state', async () => {
      const loginRes = await request
        .post('/storage/login')
        .set('Authorization', AUTH)
        .send({});
      const studentId = loginRes.body.studentId;

      const res = await request
        .get(`/storage/planner/${studentId}`)
        .set('Authorization', AUTH);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.payload);
    });

    it('returns 404 when no planner state exists', async () => {
      const otherAuth = 'Bearer no-planner-user';
      await request
        .post('/storage/login')
        .set('Authorization', otherAuth)
        .send({});

      const res = await request
        .get('/storage/planner/no-planner-user')
        .set('Authorization', otherAuth);

      assert.strictEqual(res.status, 404);
    });
  });

  describe('POST /storage/parse-transcript', () => {
    it('rejects invalid payload (missing dataBase64)', async () => {
      const res = await request
        .post('/storage/parse-transcript')
        .send({});
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.issues);
    });

    it('rejects non-base64 content gracefully', async () => {
      const res = await request
        .post('/storage/parse-transcript')
        .send({ dataBase64: 'not-valid-pdf-content' });
      assert.strictEqual(res.status, 500);
    });
  });
});
