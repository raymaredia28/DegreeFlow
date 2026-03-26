import { describe, it } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { createApp } from '../dist/app.js';

const app = createApp();
const request = supertest(app);

describe('GET /health', () => {
  it('returns 200 with ok and service name', async () => {
    const res = await request.get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.service, 'degreeflow-server');
  });

  it('returns JSON content type', async () => {
    const res = await request.get('/health');
    assert.match(res.headers['content-type'], /application\/json/);
  });
});
