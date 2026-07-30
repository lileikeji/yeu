import assert from 'node:assert/strict'
import test from 'node:test'
import { findMajorProfile, majorCollegeCount, majorProfiles } from '../data/major-profiles'
import { majorEvidenceForQuery } from '../server/modules/assistant/service'

test('2026 ordinary undergraduate majors map to ten parent colleges', () => {
  assert.equal(majorProfiles.length, 26)
  assert.equal(new Set(majorProfiles.map(item => item.name)).size, 26)
  assert.equal(majorCollegeCount, 10)
  assert.equal(findMajorProfile('会计学')?.collegeName, '会计学院')
  assert.equal(findMajorProfile('人工智能')?.collegeName, '人工智能与数据科学学院')
  assert.equal(findMajorProfile('电子信息工程')?.collegeName, '电气工程与自动化学院')
  assert.equal(majorProfiles.filter(item => item.admissionTypes.includes('transfer-undergraduate')).length, 17)
})

test('dorm areas use the supplied 2026 screenshot as provisional guidance', () => {
  assert.equal(findMajorProfile('计算机科学与技术')?.dormArea, 'new')
  assert.equal(findMajorProfile('计算机科学与技术')?.dormLabel, '新区（用户更正）')
  assert.equal(findMajorProfile('会计学')?.dormArea, 'old')
  assert.ok(majorProfiles.every(item => item.dormArea !== 'pending'))
  assert.ok(majorProfiles.every(item => /用户整理|用户更正/.test(item.dormLabel)))
  assert.ok(majorProfiles.every(item => item.dormNote.includes('迎新系统')))
})

test('assistant retrieval answers college and includes the provisional dorm area', () => {
  const collegeEvidence = majorEvidenceForQuery('会计学属于哪个学院')
  assert.equal(collegeEvidence[0]?.title, '会计学 · 会计学院')
  assert.match(collegeEvidence[0]?.snippet ?? '', /会计学属于会计学院/)

  const dormEvidence = majorEvidenceForQuery('会计学新生住新区还是旧区')
  assert.equal(dormEvidence[0]?.title, '会计学 · 会计学院')
  assert.match(dormEvidence[0]?.snippet ?? '', /宿舍片区：旧区（用户整理）/)
  assert.match(dormEvidence[0]?.snippet ?? '', /迎新系统个人结果/)
})
