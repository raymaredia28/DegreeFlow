import { describe, it } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { createApp } from '../dist/app.js';

const app = createApp();
const request = supertest(app);

describe('Error middleware', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await request.get('/this-does-not-exist');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Not found');
  });

  it('includes path in non-production 404', async () => {
    const res = await request.get('/some/missing/path');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.path, '/some/missing/path');
  });

  it('returns 404 for unknown POST routes', async () => {
    const res = await request.post('/nonexistent').send({});
    assert.strictEqual(res.status, 404);
  });

  it('returns 404 for unknown PUT routes', async () => {
    const res = await request.put('/nonexistent').send({});
    assert.strictEqual(res.status, 404);
  });
});
