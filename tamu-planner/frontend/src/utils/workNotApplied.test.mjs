import { describe, expect, it } from 'vitest';
import { reconcileWorkNotApplied } from './workNotApplied.mjs';

describe('reconcileWorkNotApplied', () => {
  it('removes courses used in minor groups from Work Not Applied', () => {
    const degreeResult = {
      groups: [{ name: 'Supporting Coursework', usedCourses: ['CSCE 121'] }],
      workNotApplied: [
        { code: 'MGMT 209', credits: 3, status: 'completed' },
        { code: 'HIST 105', credits: 3, status: 'completed' }
      ]
    };
    const minorResult = {
      groups: [{ name: 'Business Minor Core', usedCourses: ['MGMT 209'] }]
    };

    const reconciled = reconcileWorkNotApplied(degreeResult, null, minorResult);

    expect(reconciled.workNotApplied.map((c) => c.code)).toEqual(['HIST 105']);
  });

  it('removes courses used in emphasis groups from Work Not Applied', () => {
    const degreeResult = {
      groups: [{ name: 'Core', usedCourses: ['CSCE 121'] }],
      workNotApplied: [
        { code: 'CSCE 421', credits: 3, status: 'completed' },
        { code: 'POLS 206', credits: 3, status: 'completed' }
      ]
    };
    const emphasisResult = {
      groups: [{ name: 'CSCE Emphasis - Cybersecurity', usedCourses: ['CSCE 421'] }]
    };

    const reconciled = reconcileWorkNotApplied(degreeResult, emphasisResult);

    expect(reconciled.workNotApplied.map((c) => c.code)).toEqual(['POLS 206']);
  });

  it('keeps truly unused courses in Work Not Applied', () => {
    const degreeResult = {
      groups: [{ name: 'Core', usedCourses: ['CSCE 121'] }],
      workNotApplied: [{ code: 'ARTS 149', credits: 3, status: 'completed' }]
    };
    const emphasisResult = {
      groups: [{ name: 'CSCE Emphasis - Data', usedCourses: ['STAT 212'] }]
    };
    const minorResult = {
      groups: [{ name: 'Minor - Math', usedCourses: ['MATH 300'] }]
    };

    const reconciled = reconcileWorkNotApplied(degreeResult, emphasisResult, minorResult);

    expect(reconciled.workNotApplied.map((c) => c.code)).toEqual(['ARTS 149']);
  });

  it('preserves degree group assignment and only filters Work Not Applied', () => {
    const degreeResult = {
      requirementSet: { name: 'CSCE Degree' },
      groups: [
        { name: 'Core', usedCourses: ['CSCE 121'], earnedCredits: 4, requiredCredits: 4 }
      ],
      workNotApplied: [
        { code: 'MGMT 209', credits: 3, status: 'completed' },
        { code: 'POLS 206', credits: 3, status: 'completed' }
      ]
    };
    const minorResult = {
      groups: [{ name: 'Minor - Business', usedCourses: ['MGMT 209'] }]
    };

    const reconciled = reconcileWorkNotApplied(degreeResult, null, minorResult);

    expect(reconciled.groups).toEqual(degreeResult.groups);
    expect(reconciled.requirementSet).toEqual(degreeResult.requirementSet);
    expect(reconciled.workNotApplied.map((c) => c.code)).toEqual(['POLS 206']);
  });
});

