import React, { useMemo } from 'react';
import { CheckCircle, Circle, AlertCircle } from 'lucide-react';
import { validateDegreeRequirements, getRequirements } from '../utils/degreeValidator';

/**
 * DegreeProgress Component
 * 
 * Displays student's progress toward CS degree requirements
 */
export function DegreeProgress({ completedCourses, emphasisAreaCourses = [] }) {
  const validation = useMemo(() => {
    return validateDegreeRequirements(completedCourses, emphasisAreaCourses);
  }, [completedCourses, emphasisAreaCourses]);

  const requirements = getRequirements();

  const progressPercentage = Math.min(
    100,
    (validation.summary.totalCredits / validation.summary.requiredCredits) * 100
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'Complete':
        return 'text-green-600';
      case 'In Progress':
        return 'text-blue-600';
      case 'Early Progress':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (satisfied, inProgress, total) => {
    if (satisfied === total) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else if (inProgress > 0) {
      return <AlertCircle className="w-5 h-5 text-blue-600" />;
    } else {
      return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Degree Progress</h3>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall Completion
            </span>
            <span className={`text-sm font-semibold ${getStatusColor(validation.overallStatus)}`}>
              {validation.overallStatus}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${progressPercentage}%`,
                backgroundColor: progressPercentage >= 100 ? '#10b981' : '#3b82f6'
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-600">
              {validation.summary.totalCredits} / {validation.summary.requiredCredits} credits
            </span>
            <span className="text-sm text-gray-600">
              {progressPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {validation.summary.remainingCredits > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>{validation.summary.remainingCredits} credits remaining</strong> to meet graduation requirements
            </p>
          </div>
        )}
      </div>

      {/* Required Courses Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-bold text-gray-900 mb-4">Required Courses</h4>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(
                validation.requiredCourses.satisfied.length,
                validation.requiredCourses.inProgress.length,
                validation.requiredCourses.satisfied.length + 
                validation.requiredCourses.inProgress.length + 
                validation.requiredCourses.unsatisfied.length
              )}
              <span className="text-sm font-medium text-gray-700">Core CS Courses</span>
            </div>
            <span className="text-sm text-gray-600">
              {validation.requiredCourses.satisfied.length} / {
                validation.requiredCourses.satisfied.length + 
                validation.requiredCourses.unsatisfied.length
              } complete
            </span>
          </div>

          {validation.requiredCourses.inProgress.length > 0 && (
            <div className="ml-7 text-sm text-blue-600">
              {validation.requiredCourses.inProgress.length} course(s) in progress
            </div>
          )}

          {validation.requiredCourses.unsatisfied.length > 0 && (
            <div className="ml-7">
              <details className="text-sm">
                <summary className="cursor-pointer text-red-600 hover:text-red-700">
                  {validation.requiredCourses.unsatisfied.length} course(s) remaining
                </summary>
                <ul className="mt-2 space-y-1 text-gray-600">
                  {validation.requiredCourses.unsatisfied.slice(0, 5).map((item, idx) => (
                    <li key={idx} className="ml-4">
                      • {item.requirement.code || item.requirement.alternatives?.join(' or ')} - {item.reason}
                    </li>
                  ))}
                  {validation.requiredCourses.unsatisfied.length > 5 && (
                    <li className="ml-4 text-gray-500">
                      ... and {validation.requiredCourses.unsatisfied.length - 5} more
                    </li>
                  )}
                </ul>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Elective Requirements */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-md font-bold text-gray-900 mb-4">Elective Requirements</h4>
        
        <div className="space-y-4">
          {/* CS Electives */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Computer Science Electives</span>
              <span className="text-sm text-gray-600">
                {validation.csElectives.totalHours} / {validation.csElectives.requiredHours} hours
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (validation.csElectives.totalHours / validation.csElectives.requiredHours) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Emphasis Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Emphasis Area</span>
              <span className="text-sm text-gray-600">
                {validation.emphasisArea.satisfied} / {validation.emphasisArea.required} hours
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (validation.emphasisArea.satisfied / validation.emphasisArea.required) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Science Electives */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Science Electives</span>
              <span className="text-sm text-gray-600">
                {validation.scienceElectives.satisfied} / {validation.scienceElectives.required} hours
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (validation.scienceElectives.satisfied / validation.scienceElectives.required) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Core Curriculum - Simplified for now */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Core Curriculum</span>
              <span className="text-sm text-gray-600">
                0 / {requirements.coreCurriculum.totalHours} hours
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-yellow-600 h-2 rounded-full transition-all duration-500" style={{ width: '0%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Note: UCC tracking requires course categorization
            </p>
          </div>
        </div>
      </div>

      {/* Important Notes */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Important Notes</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• All required courses must be completed with a grade of C or better</li>
          <li>• A high-impact experience (CSCE 399) is required for graduation</li>
          <li>• Consult with an advisor before selecting emphasis area courses</li>
          <li>• Total of 126 credit hours required for graduation</li>
        </ul>
      </div>
    </div>
  );
}

export default DegreeProgress;
