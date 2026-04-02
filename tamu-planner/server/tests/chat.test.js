import { describe, it } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { createApp } from '../dist/app.js';

const app = createApp();
const request = supertest(app);

describe('POST /chat/completions', () => {
  it('rejects invalid body (missing messages)', async () => {
    const res = await request
      .post('/chat/completions')
      .send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Invalid request');
    assert.ok(Array.isArray(res.body.issues));
  });

  it('rejects invalid message role', async () => {
    const res = await request
      .post('/chat/completions')
      .send({ messages: [{ role: 'invalid', content: 'hello' }] });
    assert.strictEqual(res.status, 400);
  });

  it('rejects message with missing content', async () => {
    const res = await request
      .post('/chat/completions')
      .send({ messages: [{ role: 'user' }] });
    assert.strictEqual(res.status, 400);
  });

  it('proxies valid request to TAMU AI API', async (t) => {
    const mockResponse = { choices: [{ message: { role: 'assistant', content: 'Hello!' } }] };
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse)
    }));

    const res = await request
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, mockResponse);
  });

  it('forwards upstream error status', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate limited' }),
      text: async () => 'rate limited'
    }));

    const res = await request
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.error, 'TAMU AI API request failed');
  });

  it('handles fetch network errors', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network timeout');
    });

    const res = await request
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error, 'Failed to communicate with TAMU AI API');
    assert.ok(res.body.details);
  });

  it('accepts optional model and stream parameters', async (t) => {
    let capturedBody;
    t.mock.method(globalThis, 'fetch', async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [] }),
        text: async () => '{}'
      };
    });

    await request
      .post('/chat/completions')
      .send({
        messages: [{ role: 'user', content: 'test' }],
        model: 'custom-model',
        stream: true
      });
    assert.strictEqual(capturedBody.model, 'custom-model');
    assert.strictEqual(capturedBody.stream, true);
  });
});

describe('GET /chat/models', () => {
  it('returns models from TAMU AI API', async (t) => {
    const mockModels = { data: [{ id: 'model-1' }] };
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockModels,
      text: async () => JSON.stringify(mockModels)
    }));

    const res = await request.get('/chat/models');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, mockModels);
  });

  it('forwards upstream error for models endpoint', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => 'Service unavailable'
    }));

    const res = await request.get('/chat/models');
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.error, 'Failed to fetch models');
  });

  it('handles fetch error for models endpoint', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Connection refused');
    });

    const res = await request.get('/chat/models');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error, 'Failed to fetch models from TAMU AI API');
  });
});
