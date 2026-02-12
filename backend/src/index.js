import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { evaluateRequirements } from './requirements/evaluator.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const {
  PORT = 4000,
  HOST = '127.0.0.1',
  CORS_ORIGIN = 'http://localhost:5173'
} = process.env;

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true
  })
);
app.use(express.json());

// --- JSON catalog loaders ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const loadJson = async (filename) => {
  const filePath = path.join(dataDir, filename);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

// This minimal backend keeps only student data in memory for now.
// Swap with a lightweight DB later if desired.
const mem = {
  users: new Map(), // username -> { id, firstName, lastName, email, password (plain for now) }
  sessions: new Map(), // token -> userId
  nextUserId: 1
};

const issueToken = (userId) => {
  const token = Math.random().toString(36).slice(2);
  mem.sessions.set(token, userId);
  return token;
};

const auth = (req, res, next) => {
  const token = req.header('x-session-token');
  if (!token) return res.status(401).json({ error: 'Missing session token' });
  const userId = mem.sessions.get(token);
  if (!userId) return res.status(401).json({ error: 'Invalid session token' });
  req.userId = userId;
  next();
};

app.post('/auth/register', (req, res) => {
  const { firstName, lastName, email, username, password } = req.body || {};
  if (!firstName || !lastName || !email || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (mem.users.has(username)) {
    return res.status(409).json({ error: 'Username already in use' });
  }
  const user = {
    id: mem.nextUserId++,
    firstName,
    lastName,
    email,
    username,
    password
  };
  mem.users.set(username, user);
  const token = issueToken(user.id);
  return res.status(201).json({ token, user });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = mem.users.get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = issueToken(user.id);
  return res.json({ token, user });
});

app.post('/auth/logout', auth, (req, res) => {
  for (const [token, uid] of mem.sessions.entries()) {
    if (uid === req.userId) mem.sessions.delete(token);
  }
  res.json({ ok: true });
});

app.get('/auth/me', auth, (req, res) => {
  const user = Array.from(mem.users.values()).find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Catalog endpoints (read-only JSON)
app.get('/api/courses', async (_req, res, next) => {
  try {
    const courses = await loadJson('courses.json');
    res.json({ courses });
  } catch (err) {
    next(err);
  }
});

app.get('/api/minors', async (_req, res, next) => {
  try {
    const minors = await loadJson('minors.json');
    res.json({ minors });
  } catch (err) {
    next(err);
  }
});

app.get('/api/emphases', async (_req, res, next) => {
  try {
    const emphases = await loadJson('emphasis_areas.json');
    res.json({ emphases });
  } catch (err) {
    next(err);
  }
});

// Requirements evaluation using static requirement set + payload
app.post('/api/requirements/evaluate-local', async (req, res, next) => {
  try {
    const { catalogYear = null, courses = [], emphasisId = null } = req.body || {};
    const requirementSets = await loadJson('requirements.json');
    const requirementSet = catalogYear
      ? requirementSets.find((r) => r.catalog_year === catalogYear)
      : requirementSets[0];
    if (!requirementSet) return res.status(404).json({ error: 'Requirement set not found' });

    const allCourses = await loadJson('courses.json');
    const courseIndex = new Map(
      allCourses.map((c) => [c.code || `${c.department} ${c.course_number}`, c])
    );

    const studentCourses = courses.map((entry) => {
      const code = `${(entry.department || '').toUpperCase()} ${String(
        entry.course_number || ''
      ).trim()}`.trim();
      const catalogCourse = courseIndex.get(code) || {};
      return {
        course: {
          course_id: catalogCourse.course_id ?? -1,
          department: catalogCourse.department ?? entry.department ?? '',
          course_number: catalogCourse.course_number ?? entry.course_number ?? '',
          credits: entry.credits ?? catalogCourse.credits ?? 0,
          categories: catalogCourse.categories || []
        },
        grade: entry.grade || null,
        status: entry.status || 'completed'
      };
    });

    const emphasisCourseIds = new Set();
    if (emphasisId) {
      const courseEmphasis = await loadJson('course_emphasis.json').catch(() => []);
      courseEmphasis
        .filter((ce) => ce.emphasis_id === emphasisId)
        .forEach((ce) => emphasisCourseIds.add(ce.course_id));
    }

    const result = evaluateRequirements({
      requirementSet,
      studentCourses,
      emphasisCourseIds
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', detail: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
