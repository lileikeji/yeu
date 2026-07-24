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

test('dorm allocation remains pending without a 2026 official assignment', () => {
  assert.ok(majorProfiles.every(item => item.dormArea === 'pending'))
  assert.ok(majorProfiles.every(item => item.dormLabel === '待学校通知'))
  assert.ok(majorProfiles.every(item => item.dormNote.includes('未检索到学校公开')))
})

test('assistant retrieval answers college and does not guess dorm area', () => {
  const collegeEvidence = majorEvidenceForQuery('会计学属于哪个学院')
  assert.equal(collegeEvidence[0]?.title, '会计学 · 会计学院')
  assert.match(collegeEvidence[0]?.snippet ?? '', /会计学属于会计学院/)

  const dormEvidence = majorEvidenceForQuery('会计学新生住新区还是旧区')
  assert.equal(dormEvidence[0]?.title, '会计学 · 会计学院')
  assert.match(dormEvidence[0]?.snippet ?? '', /待学校通知/)
  assert.doesNotMatch(dormEvidence[0]?.snippet ?? '', /宿舍片区：(新区|旧区)/)
})
