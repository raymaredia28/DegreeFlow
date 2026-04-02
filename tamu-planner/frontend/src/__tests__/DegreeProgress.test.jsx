import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DegreeProgress } from '../components/DegreeProgress';

describe('DegreeProgress', () => {
  it('renders without crashing with empty courses', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Degree Progress')).toBeInTheDocument();
  });

  it('displays overall completion status', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Overall Completion')).toBeInTheDocument();
  });

  it('shows credit totals', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText(/0 \/ 126 credits/)).toBeInTheDocument();
  });

  it('shows remaining credits message', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText(/126 credits remaining/)).toBeInTheDocument();
  });

  it('updates progress with completed courses', () => {
    const courses = [
      { code: 'CSCE 120', credits: 3, grade: 'A' },
      { code: 'MATH 151', credits: 4, grade: 'B' }
    ];
    render(<DegreeProgress completedCourses={courses} />);
    expect(screen.getByText(/7 \/ 126 credits/)).toBeInTheDocument();
  });

  it('shows required courses section', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Required Courses')).toBeInTheDocument();
    expect(screen.getByText('Core CS Courses')).toBeInTheDocument();
  });

  it('shows elective requirements section', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Elective Requirements')).toBeInTheDocument();
    expect(screen.getByText('Computer Science Electives')).toBeInTheDocument();
    expect(screen.getByText('Emphasis Area')).toBeInTheDocument();
    expect(screen.getByText('Science Electives')).toBeInTheDocument();
  });

  it('shows core curriculum section', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Core Curriculum')).toBeInTheDocument();
  });

  it('shows important notes', () => {
    render(<DegreeProgress completedCourses={[]} />);
    expect(screen.getByText('Important Notes')).toBeInTheDocument();
  });

  it('shows courses remaining details', () => {
    render(<DegreeProgress completedCourses={[]} />);
    const remaining = screen.getByText(/course\(s\) remaining/);
    expect(remaining).toBeInTheDocument();
  });

  it('shows satisfied course count', () => {
    const courses = [
      { code: 'CHEM 107', credits: 3, grade: 'A' },
      { code: 'CHEM 117', credits: 1, grade: 'A' }
    ];
    render(<DegreeProgress completedCourses={courses} />);
    expect(screen.getByText(/2 \//)).toBeInTheDocument();
  });

  it('handles in-progress courses display', () => {
    const courses = [
      { code: 'CSCE 120', credits: 3, grade: 'IP' }
    ];
    render(<DegreeProgress completedCourses={courses} />);
    expect(screen.getByText(/course\(s\) in progress/)).toBeInTheDocument();
  });

  it('shows emphasis area progress with emphasis courses', () => {
    const courses = [
      { code: 'MATH 401', credits: 3, grade: 'A' },
      { code: 'MATH 447', credits: 3, grade: 'A' }
    ];
    render(
      <DegreeProgress
        completedCourses={courses}
        emphasisAreaCourses={['MATH 401', 'MATH 447']}
      />
    );
    expect(screen.getByText(/6 \/ 12 hours/)).toBeInTheDocument();
  });

  it('shows science elective progress', () => {
    const courses = [
      { code: 'BIOL 111', credits: 4, grade: 'A' }
    ];
    render(<DegreeProgress completedCourses={courses} />);
    expect(screen.getByText(/4 \/ 7 hours/)).toBeInTheDocument();
  });
});
