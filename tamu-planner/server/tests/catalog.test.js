import { describe, it } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { createApp } from '../dist/app.js';

const app = createApp();
const request = supertest(app);

describe('GET /api/courses', () => {
  it('returns 200 with a courses array', async () => {
    const res = await request.get('/api/courses');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.courses));
    assert.ok(res.body.courses.length > 0, 'courses should not be empty');
  });
});

describe('GET /api/minors', () => {
  it('returns 200 with a minors array', async () => {
    const res = await request.get('/api/minors');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.minors));
    assert.ok(res.body.minors.length > 0);
  });
});

describe('GET /api/emphases', () => {
  it('returns 200 with an emphases array', async () => {
    const res = await request.get('/api/emphases');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.emphases));
    assert.ok(res.body.emphases.length > 0);
  });
});

describe('POST /api/requirements/evaluate-local', () => {
  it('evaluates with empty courses and returns groups', async () => {
    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({ courses: [] });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.groups), 'should have groups array');
  });

  it('evaluates with a known course', async () => {
    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({
        courses: [
          { department: 'ENGL', course_number: '221', credits: 3, grade: 'A', status: 'completed' }
        ]
      });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });

  it('accepts emphasisId parameter', async () => {
    const emphases = (await request.get('/api/emphases')).body.emphases;
    const firstEmphasis = emphases[0];
    if (!firstEmphasis) return;

    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({
        emphasisId: firstEmphasis.emphasis_id,
        courses: [
          { department: 'MATH', course_number: '401', credits: 3, grade: 'A', status: 'completed' }
        ]
      });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });

  it('accepts minorId parameter', async () => {
    const minors = (await request.get('/api/minors')).body.minors;
    const firstMinor = minors[0];
    if (!firstMinor) return;

    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({
        minorId: firstMinor.minor_id,
        courses: []
      });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });

  it('accepts degreeEmphasisId for degree-level evaluation', async () => {
    const emphases = (await request.get('/api/emphases')).body.emphases;
    const firstEmphasis = emphases[0];
    if (!firstEmphasis) return;

    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({
        degreeEmphasisId: firstEmphasis.emphasis_id,
        courses: [
          { department: 'CSCE', course_number: '120', credits: 3, grade: 'A', status: 'completed' }
        ]
      });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });

  it('handles hasHsLanguage and hasSabrCourse flags', async () => {
    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({
        courses: [],
        hasHsLanguage: true,
        hasSabrCourse: true
      });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });

  it('falls back to first degree requirement set', async () => {
    const res = await request
      .post('/api/requirements/evaluate-local')
      .send({});
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.groups);
  });
});
