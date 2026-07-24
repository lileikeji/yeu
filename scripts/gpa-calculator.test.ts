import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGpa, courseGradePoint, percentageGradePoint } from '../app/utils/gpa-calculator'

test('percentage grade points follow the public 2021 rule', () => {
  assert.equal(percentageGradePoint(59), 0)
  assert.equal(percentageGradePoint(60), 1)
  assert.equal(percentageGradePoint(86), 3.6)
  assert.equal(percentageGradePoint(100), 5)
})

test('retake pass is fixed at one grade point', () => {
  assert.equal(courseGradePoint({ credits: 3, mode: 'percentage', score: 92, isRetake: true }), 1)
  assert.equal(courseGradePoint({ credits: 3, mode: 'percentage', score: 58, isRetake: true }), 0)
})

test('GPA uses credit-weighted points and skips zero-credit courses', () => {
  const result = calculateGpa([
    { credits: 3, mode: 'percentage', score: 86 },
    { credits: 2, mode: 'five-level', grade: '良好' },
    { credits: 0, mode: 'percentage', score: 100 }
  ])
  assert.equal(result.totalCredits, 5)
  assert.equal(result.includedCourses, 2)
  assert.equal(result.gpa, 3.36)
})
