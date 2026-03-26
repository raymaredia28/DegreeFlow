import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import {
  getOrCreateStudent,
  saveTranscriptTerms,
  getTranscriptForStudent,
  savePlannerState,
  getPlannerState
} from '../dist/storage/localDb.js';

const dbPath = process.env.LOCAL_DB_PATH || '/tmp/degreeflow-test-db.json';

before(async () => {
  await fs.unlink(dbPath).catch(() => {});
});

after(async () => {
  await fs.unlink(dbPath).catch(() => {});
});

describe('getOrCreateStudent', () => {
  it('creates a new student', async () => {
    const student = await getOrCreateStudent({
      uid: 'user-1',
      email: 'alice@example.com',
      name: 'Alice Smith'
    });
    assert.strictEqual(student.user_id, 'user-1');
    assert.strictEqual(student.first_name, 'Alice');
    assert.strictEqual(student.last_name, 'Smith');
    assert.strictEqual(student.email, 'alice@example.com');
  });

  it('returns existing student on second call', async () => {
    const student = await getOrCreateStudent({
      uid: 'user-1',
      email: 'alice@example.com',
      name: 'Alice Smith'
    });
    assert.strictEqual(student.user_id, 'user-1');
    assert.strictEqual(student.email, 'alice@example.com');
  });

  it('updates student info when it changes', async () => {
    const student = await getOrCreateStudent({
      uid: 'user-1',
      email: 'alice-new@example.com',
      name: 'Alice Johnson'
    });
    assert.strictEqual(student.email, 'alice-new@example.com');
    assert.strictEqual(student.last_name, 'Johnson');
  });

  it('handles missing name', async () => {
    const student = await getOrCreateStudent({
      uid: 'user-no-name',
      email: 'noname@example.com'
    });
    assert.strictEqual(student.user_id, 'user-no-name');
    assert.strictEqual(student.first_name, '');
    assert.strictEqual(student.last_name, '');
  });

  it('handles single-word name', async () => {
    const student = await getOrCreateStudent({
      uid: 'user-single-name',
      name: 'Madonna'
    });
    assert.strictEqual(student.first_name, 'Madonna');
    assert.strictEqual(student.last_name, '');
  });
});

describe('saveTranscriptTerms / getTranscriptForStudent', () => {
  it('saves and retrieves transcript terms', async () => {
    const terms = [
      {
        label: 'Fall 2024',
        status: 'completed',
        courses: [
          { code: 'CSCE 120', title: 'Program Design', credits: 3, grade: 'A' }
        ]
      }
    ];

    await saveTranscriptTerms('user-1', terms);
    const retrieved = await getTranscriptForStudent('user-1');

    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].label, 'Fall 2024');
    assert.strictEqual(retrieved[0].courses[0].code, 'CSCE 120');
  });

  it('overwrites previous terms', async () => {
    const newTerms = [
      {
        label: 'Spring 2025',
        status: 'completed',
        courses: [
          { code: 'CSCE 221', title: 'Data Structures', credits: 4, grade: 'B' }
        ]
      }
    ];

    await saveTranscriptTerms('user-1', newTerms);
    const retrieved = await getTranscriptForStudent('user-1');

    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].label, 'Spring 2025');
  });

  it('returns empty array for unknown student', async () => {
    const result = await getTranscriptForStudent('nonexistent');
    assert.deepStrictEqual(result, []);
  });

  it('throws when saving for nonexistent student', async () => {
    await assert.rejects(
      () => saveTranscriptTerms('ghost-user', []),
      /not found/i
    );
  });
});

describe('savePlannerState / getPlannerState', () => {
  it('saves and retrieves planner state', async () => {
    const payload = { semesters: [{ name: 'Fall 2025', courses: [] }] };
    const state = await savePlannerState('user-1', payload);

    assert.strictEqual(state.user_id, 'user-1');
    assert.strictEqual(state.id, 'current');
    assert.deepStrictEqual(state.payload, payload);
    assert.ok(state.created_at);
    assert.ok(state.updated_at);
  });

  it('retrieves saved planner state', async () => {
    const state = await getPlannerState('user-1');
    assert.ok(state);
    assert.strictEqual(state.user_id, 'user-1');
    assert.ok(state.payload);
  });

  it('preserves created_at on update', async () => {
    const first = await getPlannerState('user-1');
    const newPayload = { semesters: [{ name: 'Spring 2026', courses: ['CSCE 482'] }] };
    const second = await savePlannerState('user-1', newPayload);

    assert.strictEqual(second.created_at, first.created_at);
    assert.deepStrictEqual(second.payload, newPayload);
  });

  it('returns null for unknown student', async () => {
    const state = await getPlannerState('nonexistent');
    assert.strictEqual(state, null);
  });

  it('throws when saving for nonexistent student', async () => {
    await assert.rejects(
      () => savePlannerState('ghost-user', {}),
      /not found/i
    );
  });
});
