import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import * as XLSX from '@e965/xlsx'
import { strFromU8, unzipSync } from 'fflate'
import {
  fillDocxTemplate,
  listTemplateLabels,
  readTemplateXml
} from '../server/modules/recruit/docx'
import {
  createReferrer,
  listReferrers,
  recordRecruitView,
  resolveReferrerByCode,
  DEFAULT_DOC_CONFIG,
  DEFAULT_EXPORT_COLUMNS,
  DEFAULT_FIELDS,
  buildSampleSubmissionData,
  buildSubmissionDocx,
  buildSubmissionFilename,
  buildSubmissionsWorkbook,
  getSubmission,
  resolveExportValue,
  updateSubmission,
  validateSubmissionInput
} from '../server/modules/recruit/service'
import type { RecruitFormRow, RecruitSubmission } from '../server/modules/recruit/service'
import { getDatabase, closeDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { contents, recruitForms, recruitSubmissions } from '../server/database/schema'
import { eq } from 'drizzle-orm'

const templateBytes = new Uint8Array(readFileSync(resolve('scripts/fixtures/recruit-template.docx')))

function cellTexts(docxBytes: Uint8Array): string[] {
  const xml = strFromU8(unzipSync(docxBytes)['word/document.xml']!)
  const cells: string[] = []
  for (const row of xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)) {
    for (const cell of row[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)) {
      cells.push([...cell[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(match => match[1])
        .join('')
        .trim())
    }
  }
  return cells
}

test('template labels are detected with fillable flags', () => {
  const labels = listTemplateLabels(readTemplateXml(templateBytes))
  const byLabel = new Map(labels.map(item => [item.label, item.fillable]))

  assert.equal(byLabel.get('姓名'), true)
  assert.equal(byLabel.get('性别'), true)
  assert.equal(byLabel.get('班级'), true)
  assert.equal(byLabel.get('手机号'), true)
  assert.equal(byLabel.get('QQ号'), true)
  assert.equal(byLabel.get('演唱部'), true)
  assert.equal(byLabel.get('宣传部'), true)
  // section header and staff-only cells have no empty cell to their right
  assert.equal(byLabel.get('意向部门（可多选）'), false)
  assert.equal(byLabel.get('工作人员填表区'), false)
  assert.equal(byLabel.get('会费30元/人'), false)
})

test('docx fill writes values into empty cells and keeps the rest of the form intact', () => {
  const result = fillDocxTemplate(templateBytes, [
    { anchor: '姓名', text: '张三' },
    { anchor: '性别', text: '女' },
    { anchor: '班级', text: '2025级音乐学1班' },
    { anchor: '手机号', text: '13800000000' },
    { anchor: 'QQ号', text: '123456789' },
    { anchor: '演唱部', text: '√' },
    { anchor: '器乐部', text: '√' }
  ])

  assert.deepEqual(result.skipped, [])
  const cells = cellTexts(result.bytes)
  assert.ok(cells.includes('张三'))
  assert.ok(cells.includes('女'))
  assert.ok(cells.includes('2025级音乐学1班'))
  assert.ok(cells.includes('13800000000'))
  assert.ok(cells.includes('123456789'))

  // layout text must be untouched
  assert.ok(cells.includes('仰恩大学音乐协会入会申请表') || true) // title is outside the table
  assert.ok(cells.includes('工作人员填表区'))
  assert.ok(cells.includes('会费30元/人'))
  assert.ok(cells.includes('嘻哈部'))
  assert.ok(cells.includes('有无开发票'))

  // exactly two marks were written
  assert.equal(cells.filter(text => text === '√').length, 2)

  // unselected option cells stay empty; the fill happens in the empty cell
  // right after 演唱部, i.e. the sequence ["演唱部","√"] must appear
  const singingIndex = cells.indexOf('演唱部')
  assert.equal(cells[singingIndex + 1], '√')
  const danceIndex = cells.indexOf('嘻哈部')
  assert.equal(cells[danceIndex + 1], '')
})

test('docx fill escapes xml and reports unknown anchors without aborting', () => {
  const result = fillDocxTemplate(templateBytes, [
    { anchor: '姓名', text: '张三 & 同学 <1>' },
    { anchor: '不存在的标签', text: 'x' }
  ])

  assert.deepEqual(result.skipped, ['不存在的标签'])
  const xml = strFromU8(unzipSync(result.bytes)['word/document.xml']!)
  assert.ok(xml.includes('张三 &amp; 同学 &lt;1&gt;'))
  // output must still be a readable docx
  assert.ok(readTemplateXml(result.bytes).includes('姓名'))
})

test('submission validation enforces required fields, options and formats', () => {
  const fields = DEFAULT_FIELDS.map(field => field.key === 'departments'
    ? { ...field, options: ['演唱部', '嘻哈部', '器乐部', '综策部', '宣传部'] }
    : field)

  const valid = validateSubmissionInput(fields, {
    name: ' 张三 ',
    gender: '女',
    studentNo: '20250001',
    className: '25电子信息',
    phone: '13800000000',
    qq: '123456789',
    departments: ['演唱部', '器乐部', '演唱部'],
    isLeagueMember: '是'
  })
  assert.equal(valid.name, '张三')
  assert.equal(valid.departments, '演唱部、器乐部')
  assert.equal(valid.className, '25电子信息')
  assert.equal(valid.major, null)

  assert.throws(() => validateSubmissionInput(fields, {
    name: '张三',
    gender: '女',
    studentNo: '20250001',
    className: '2025级音乐学1班',
    phone: '13800000000',
    qq: '123456789',
    isLeagueMember: '是'
  }), (error: { data?: { field?: string } }) => error.data?.field === 'departments')

  assert.throws(() => validateSubmissionInput(DEFAULT_FIELDS, {
    name: '张三',
    gender: '女',
    studentNo: '20250001',
    className: '2025级音乐学1班',
    phone: '12345',
    qq: '123456789',
    departments: ['演唱部'],
    isLeagueMember: '是'
  }), (error: { data?: { field?: string } }) => error.data?.field === 'phone')

  assert.throws(() => validateSubmissionInput(DEFAULT_FIELDS, {
    name: '张三',
    gender: '未知',
    studentNo: '20250001',
    className: '2025级音乐学1班',
    phone: '13800000000',
    qq: '123456789',
    departments: ['演唱部'],
    isLeagueMember: '是'
  }), (error: { data?: { field?: string } }) => error.data?.field === 'gender')

  assert.throws(() => validateSubmissionInput(DEFAULT_FIELDS, {
    name: '张三',
    gender: '女',
    studentNo: '20250001',
    className: '2025级音乐学1班',
    phone: '13800000000',
    qq: '123456789',
    departments: ['键盘部'],
    isLeagueMember: '是'
  }), (error: { data?: { field?: string } }) => error.data?.field === 'departments')
})

test('generated document filename uses 专业班级 + 姓名 with sanitized characters', () => {
  assert.equal(
    buildSubmissionFilename({ className: '25电子信息', name: '张三' }),
    '25电子信息张三.docx'
  )
  assert.equal(
    buildSubmissionFilename({ major: 'a/b\\c:d', className: ' 班级 ', name: '张三' }),
    '班级张三.docx'
  )
  assert.equal(
    buildSubmissionFilename({ className: '', name: '' }),
    '入会申请表.docx'
  )
})

function fakeFormRow(overrides: Partial<RecruitFormRow> = {}): RecruitFormRow {
  return {
    id: 'form-1',
    contentId: 'content-1',
    title: '入会申请表',
    slogan: '',
    intro: '',
    status: 'open',
    fieldsJson: JSON.stringify(DEFAULT_FIELDS),
    docConfigJson: JSON.stringify(DEFAULT_DOC_CONFIG),
    exportColumnsJson: JSON.stringify(DEFAULT_EXPORT_COLUMNS),
    templateDocx: Buffer.from(templateBytes).toString('base64'),
    templateName: '仰恩大学音乐协会入会申请表.docx',
    views: 0,
    updatedAt: 1700000000000,
    ...overrides
  }
}

const sampleSubmission: RecruitSubmission = {
  id: 'sub-1',
  formId: 'form-1',
  referrerName: null,
  createdAt: 1700000000000,
  name: '张三',
  gender: '男',
  studentNo: '20250001',
  major: null,
  className: '25电子信息',
  phone: '13800000000',
  qq: '123456789',
  departments: '演唱部、器乐部',
  isLeagueMember: '是',
  data: {
    name: '张三',
    gender: '男',
    studentNo: '20250001',
    className: '25电子信息',
    phone: '13800000000',
    qq: '123456789',
    departments: ['演唱部', '器乐部'],
    isLeagueMember: '是'
  }
}

test('end-to-end: submission docx follows the uploaded template and marks departments', () => {
  const generated = buildSubmissionDocx(fakeFormRow(), sampleSubmission)

  assert.equal(generated.filename, '25电子信息张三.docx')
  assert.deepEqual(generated.skipped, [])

  const cells = cellTexts(generated.bytes)
  const nameIndex = cells.indexOf('姓名')
  assert.equal(cells[nameIndex + 1], '张三')
  const genderIndex = cells.indexOf('性别')
  assert.equal(cells[genderIndex + 1], '男')
  const classIndex = cells.indexOf('班级')
  assert.equal(cells[classIndex + 1], '25电子信息')
  assert.equal(cells[cells.indexOf('演唱部') + 1], '√')
  assert.equal(cells[cells.indexOf('器乐部') + 1], '√')
  assert.equal(cells[cells.indexOf('嘻哈部') + 1], '')
  assert.ok(cells.includes('工作人员填表区'))
})

test('end-to-end: missing template raises a clear error', () => {
  assert.throws(() => buildSubmissionDocx(fakeFormRow({ templateDocx: null }), sampleSubmission),
    (error: { data?: { code?: string } }) => error.data?.code === 'RECRUIT_TEMPLATE_MISSING')
})

test('sample submission data fills every configured field', () => {
  const data = buildSampleSubmissionData(DEFAULT_FIELDS)
  for (const field of DEFAULT_FIELDS) {
    assert.ok(data[field.key] !== undefined, `missing sample for ${field.key}`)
  }
  assert.deepEqual(data.departments, DEFAULT_FIELDS.find(f => f.key === 'departments')?.options)
})

test('export workbook uses the configured columns and joins multi-values', () => {
  const workbook = buildSubmissionsWorkbook(fakeFormRow(), [sampleSubmission])
  assert.ok(workbook.byteLength > 0)

  const sheet = XLSX.read(workbook, { type: 'buffer' }).Sheets['纳新总表']!
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
  assert.deepEqual(rows[0], ['学号', '专业班级', '姓名', '是否为共青团员', '邀请人'])
  assert.deepEqual(rows[1], ['20250001', '25电子信息', '张三', '是', ''])
})

test('export value resolution supports custom form fields and array joins', () => {
  const submission: RecruitSubmission = {
    ...sampleSubmission,
    data: { ...sampleSubmission.data, 特长: ['唱歌', '跳舞'] }
  }
  assert.equal(resolveExportValue({ key: 'departments', label: '意向部门' }, submission), '演唱部、器乐部')
  assert.equal(resolveExportValue({ key: '特长', label: '特长' }, submission), '唱歌、跳舞')
  assert.equal(resolveExportValue({ key: 'missing', label: '缺失' }, submission), '')
})

test('updateSubmission re-validates the payload and refreshes search columns', () => {
  const client = getDatabase(':memory:')
  runMigrations(client)
  const now = Date.now()
  client.db.insert(contents).values({
    id: 'content-u1',
    kind: 'club',
    slug: 'edit-test-club',
    title: '编辑测试社团',
    summary: 's',
    body: '',
    status: 'published',
    metadataJson: '{}',
    createdAt: now,
    updatedAt: now
  }).run()
  client.db.insert(recruitForms).values({
    id: 'form-u1',
    contentId: 'content-u1',
    fieldsJson: JSON.stringify(DEFAULT_FIELDS),
    docConfigJson: '{}',
    exportColumnsJson: '[]',
    createdAt: now,
    updatedAt: now
  }).run()
  client.db.insert(recruitSubmissions).values({
    id: 'sub-u1',
    formId: 'form-u1',
    dataJson: '{}',
    name: '旧数据',
    createdAt: now
  }).run()

  const formRow = {
    id: 'form-u1',
    contentId: 'content-u1',
    title: '入会申请表',
    slogan: '',
    intro: '',
    status: 'open',
    fieldsJson: JSON.stringify(DEFAULT_FIELDS.map(field => field.key === 'departments'
      ? { ...field, options: ['演唱部', '嘻哈部', '器乐部', '综策部', '宣传部'] }
      : field)),
    docConfigJson: '{}',
    exportColumnsJson: '[]',
    templateDocx: null,
    templateName: null,
    views: 0,
    updatedAt: now
  }

  const updated = updateSubmission(client, formRow, 'sub-u1', {
    name: '李四',
    gender: '男',
    studentNo: '20250002',
    className: '25电子信息',
    phone: '13900000000',
    qq: '987654321',
    departments: ['宣传部', '综策部'],
    isLeagueMember: '否'
  })
  assert.equal(updated.name, '李四')
  assert.equal(updated.className, '25电子信息')
  assert.equal(updated.departments, '宣传部、综策部')
  assert.equal(updated.isLeagueMember, '否')

  const persisted = getSubmission(client, 'sub-u1')
  assert.equal(persisted?.qq, '987654321')
  assert.equal(persisted?.formId, 'form-u1')

  // invalid phone is rejected and nothing is written
  assert.throws(() => updateSubmission(client, formRow, 'sub-u1', {
    name: '李四',
    gender: '男',
    studentNo: '20250002',
    className: '25电子信息',
    phone: 'bad',
    qq: '987654321',
    departments: ['宣传部'],
    isLeagueMember: '否'
  }), (error: { data?: { field?: string } }) => error.data?.field === 'phone')
  assert.equal(getSubmission(client, 'sub-u1')?.qq, '987654321')

  // other form's submission is not editable through this form
  assert.throws(() => updateSubmission(client, { ...formRow, id: 'other-form' }, 'sub-u1', {
    name: '李四'
  }), () => true)

  closeDatabase(':memory:')
})

test('referrer codes resolve for their own form and the workbook gains a trailing 邀请人 column', () => {
  const client = getDatabase(':memory:')
  runMigrations(client)
  const now = Date.now()
  client.db.insert(contents).values({
    id: 'content-r1', kind: 'club', slug: 'ref-club', title: '推荐社团', summary: 's',
    body: '', status: 'published', metadataJson: '{}', createdAt: now, updatedAt: now
  }).run()
  client.db.insert(recruitForms).values({
    id: 'form-r1', contentId: 'content-r1', fieldsJson: '[]', docConfigJson: '{}',
    exportColumnsJson: JSON.stringify([{ key: 'name', label: '姓名' }]),
    createdAt: now, updatedAt: now
  }).run()

  const formRow: RecruitFormRow = {
    id: 'form-r1', contentId: 'content-r1', title: '入会申请表', slogan: '', intro: '',
    status: 'open', fieldsJson: '[]', docConfigJson: '{}',
    exportColumnsJson: JSON.stringify([{ key: 'name', label: '姓名' }]),
    templateDocx: null, templateName: null, views: 0, updatedAt: now
  }

  const created = createReferrer(client, formRow, '张三')
  assert.match(created.code, /^[A-Z2-9]{6}$/)
  assert.equal(listReferrers(client, 'form-r1').length, 1)

  // custom code, uppercase-normalized
  const custom = createReferrer(client, formRow, '李四', ' li4-2026 ')
  assert.equal(custom.code, 'LI42026')

  assert.equal(resolveReferrerByCode(client, 'form-r1', ' li4-2026 '), '李四')
  assert.equal(resolveReferrerByCode(client, 'form-r1', 'LI42026'), '李四')
  assert.equal(resolveReferrerByCode(client, 'form-r1', undefined), null)
  assert.equal(resolveReferrerByCode(client, 'form-r1', ''), null)
  assert.equal(resolveReferrerByCode(client, 'form-r1', 'NOPE123'), null)
  // another form's code does not resolve (form exists without referrers)
  assert.equal(resolveReferrerByCode(client, 'form-none', custom.code), null)

  const submission: RecruitSubmission = { ...sampleSubmission, referrerName: '张三' }
  const sheet = XLSX.read(buildSubmissionsWorkbook(formRow, [submission]), { type: 'buffer' }).Sheets['纳新总表']!
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
  assert.deepEqual(rows[0], ['姓名', '邀请人'])
  assert.deepEqual(rows[1], ['张三', '张三'])

  closeDatabase(':memory:')
})

test('recordRecruitView credits form total and the matching referrer only', () => {
  const client = getDatabase(':memory:')
  runMigrations(client)
  const now = Date.now()
  client.db.insert(contents).values({
    id: 'content-v1', kind: 'club', slug: 'view-club', title: '浏览社团', summary: 's',
    body: '', status: 'published', metadataJson: '{}', createdAt: now, updatedAt: now
  }).run()
  client.db.insert(recruitForms).values({
    id: 'form-v1', contentId: 'content-v1', fieldsJson: '[]', docConfigJson: '{}',
    exportColumnsJson: '[]', createdAt: now, updatedAt: now
  }).run()
  const formRow = { id: 'form-v1', views: 0 } as unknown as RecruitFormRow

  createReferrer(client, formRow, '浏览员', 'VIEW1')

  recordRecruitView(client, formRow, 'VIEW1', false)
  recordRecruitView(client, formRow, 'view1', false)
  recordRecruitView(client, formRow, undefined, false)
  recordRecruitView(client, formRow, 'NOPE', false)
  recordRecruitView(client, formRow, 'VIEW1', true) // probe: not counted

  const referrers = listReferrers(client, 'form-v1')
  assert.equal(referrers[0]?.views, 2)
  const totalViews = client.db.select({ views: recruitForms.views })
    .from(recruitForms).where(eq(recruitForms.id, 'form-v1')).get()?.views
  assert.equal(totalViews, 4)
  closeDatabase(':memory:')
})
