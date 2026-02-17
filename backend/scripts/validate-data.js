#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

const dataDir = path.join(process.cwd(), '../backend', 'data');

const load = async (file) => JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));

const collectCourseCodes = (courses) => {
  const codes = new Set();
  courses.forEach((c) => {
    if (c.codes) c.codes.forEach((code) => codes.add(code.toUpperCase()));
    if (c.aliases) c.aliases.forEach((code) => codes.add(code.toUpperCase()));
    const primary =
      c.code ||
      (c.department && c.course_number ? `${c.department} ${c.course_number}`.toUpperCase() : null);
    if (primary) codes.add(primary);
  });
  return codes;
};

const collectRulesCodes = (rules) => {
  const codes = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      codes.push(node.toUpperCase());
      return;
    }
    if (node.allOf) walk(node.allOf);
    if (node.anyOf) walk(node.anyOf);
    if (node.pool) walk(node.pool);
    if (node.items) walk(node.items);
  };
  walk(rules);
  return codes;
};

const main = async () => {
  const courses = await load('courses.json');
  const requirements = await load('requirements.json');

  const courseCodes = collectCourseCodes(courses);
  const missing = [];

  requirements.forEach((set) => {
    (set.groups || []).forEach((group) => {
      const codes = collectRulesCodes(group.rules || {});
      codes.forEach((code) => {
        if (!courseCodes.has(code)) {
          missing.push({ set: set.name, group: group.name, code });
        }
      });
    });
  });

  if (missing.length) {
    console.error('Missing course codes referenced in requirements:');
    missing.forEach((m) => console.error(`- ${m.set} / ${m.group}: ${m.code}`));
    process.exit(1);
  } else {
    console.log('Validation passed: all requirement course codes exist in courses.json');
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
