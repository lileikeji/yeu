export const fiveLevelGradePoints = {
  优秀: 4,
  良好: 3,
  中等: 2,
  及格: 1,
  不及格: 0
} as const

export type FiveLevelGrade = keyof typeof fiveLevelGradePoints
export type GpaCourseMode = 'percentage' | 'five-level'

export interface GpaCourseInput {
  credits: number
  mode: GpaCourseMode
  score?: number
  grade?: FiveLevelGrade
  isRetake?: boolean
}

export interface GpaCourseResult extends GpaCourseInput {
  gradePoint: number
  qualityPoints: number
  included: boolean
}

export interface GpaCalculationResult {
  gpa: number | null
  totalCredits: number
  totalQualityPoints: number
  includedCourses: number
  courses: GpaCourseResult[]
}

export function percentageGradePoint(score: number): number {
  if (!Number.isFinite(score) || score < 60) return 0
  return Math.round(Math.min(5, Math.max(1, score / 10 - 5)) * 100) / 100
}

export function courseGradePoint(course: GpaCourseInput): number {
  if (course.isRetake) {
    const passed = course.mode === 'percentage'
      ? Number(course.score) >= 60
      : Boolean(course.grade && course.grade !== '不及格')
    return passed ? 1 : 0
  }
  if (course.mode === 'five-level') return fiveLevelGradePoints[course.grade ?? '不及格']
  return percentageGradePoint(Number(course.score))
}

export function calculateGpa(courses: GpaCourseInput[]): GpaCalculationResult {
  const results = courses.map((course): GpaCourseResult => {
    const credits = Number.isFinite(Number(course.credits)) ? Math.max(0, Number(course.credits)) : 0
    const gradePoint = courseGradePoint(course)
    return {
      ...course,
      credits,
      gradePoint,
      qualityPoints: credits * gradePoint,
      included: credits > 0
    }
  })
  const included = results.filter(course => course.included)
  const totalCredits = included.reduce((sum, course) => sum + course.credits, 0)
  const totalQualityPoints = included.reduce((sum, course) => sum + course.qualityPoints, 0)
  return {
    gpa: totalCredits > 0 ? Math.round((totalQualityPoints / totalCredits) * 10_000) / 10_000 : null,
    totalCredits,
    totalQualityPoints,
    includedCourses: included.length,
    courses: results
  }
}
