export interface ParsedYeucaImportRow {
  rowIndex: number
  studentNo: string
  name: string
  gradeMajorClass: string
  department: string
  roleTitle: string
  term: string
  phone: string
  qq: string
  email: string
  gitUsername: string
  notes: string
  valid: boolean
  reason: string
}

const STUDENT_NO_RE = /^[a-zA-Z0-9_-]{4,32}$/

const HEADER_ALIASES: Record<string, keyof Omit<ParsedYeucaImportRow, 'rowIndex' | 'valid' | 'reason'>> = {
  学号: 'studentNo',
  studentno: 'studentNo',
  student_no: 'studentNo',
  stu_no: 'studentNo',
  id: 'studentNo',
  编号: 'studentNo',
  姓名: 'name',
  真实姓名: 'name',
  名字: 'name',
  name: 'name',
  班级: 'gradeMajorClass',
  专业班级: 'gradeMajorClass',
  年级专业: 'gradeMajorClass',
  年级专业班级: 'gradeMajorClass',
  专业: 'gradeMajorClass',
  class: 'gradeMajorClass',
  major: 'gradeMajorClass',
  grademajorclass: 'gradeMajorClass',
  部门: 'department',
  所属部门: 'department',
  分组: 'department',
  意向部门: 'department',
  department: 'department',
  dept: 'department',
  角色: 'roleTitle',
  职务: 'roleTitle',
  会内角色: 'roleTitle',
  身份: 'roleTitle',
  role: 'roleTitle',
  roletitle: 'roleTitle',
  届别: 'term',
  学年: 'term',
  届数: 'term',
  term: 'term',
  手机: 'phone',
  手机号: 'phone',
  电话: 'phone',
  联系方式: 'phone',
  phone: 'phone',
  qq: 'qq',
  qq号: 'qq',
  邮箱: 'email',
  email: 'email',
  git: 'gitUsername',
  git用户名: 'gitUsername',
  gitusername: 'gitUsername',
  用户名: 'gitUsername',
  备注: 'notes',
  说明: 'notes',
  notes: 'notes'
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .replace(/[*＊:：\s()/（）]/g, '')
    .toLowerCase()
}

function validateImportRow(
  row: Omit<ParsedYeucaImportRow, 'rowIndex' | 'valid' | 'reason'>,
  rowIndex: number
): ParsedYeucaImportRow {
  if (!row.studentNo) {
    return { ...row, rowIndex, valid: false, reason: '缺少学号' }
  }
  if (!STUDENT_NO_RE.test(row.studentNo)) {
    return { ...row, rowIndex, valid: false, reason: '学号需 4~32 位字母/数字/下划线或短横线' }
  }
  if (!row.name) {
    return { ...row, rowIndex, valid: false, reason: '缺少姓名' }
  }
  return { ...row, rowIndex, valid: true, reason: '' }
}

/**
 * 将表格二维数组或带表头对象数组解析为标准化成员导入行。
 * 若首行不含表头关键词，则按默认列顺序：学号、姓名、专业班级、部门、角色、手机、QQ。
 */
export function parseMatrixToMemberImportRows(matrix: unknown[][]): ParsedYeucaImportRow[] {
  const cleaned = matrix
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(cell => cell.length > 0))

  if (!cleaned.length) return []

  const firstRow = cleaned[0]!
  const mappedCols = firstRow.map(cell => HEADER_ALIASES[normalizeHeaderKey(cell)] ?? null)
  const recognizedHeaders = mappedCols.filter(Boolean).length
  const hasHeaderRow = recognizedHeaders >= 2

  const fallbackOrder: Array<keyof Omit<ParsedYeucaImportRow, 'rowIndex' | 'valid' | 'reason'>> = [
    'studentNo',
    'name',
    'gradeMajorClass',
    'department',
    'roleTitle',
    'phone',
    'qq',
    'email',
    'notes'
  ]

  const colMap = hasHeaderRow ? mappedCols : firstRow.map((_, idx) => fallbackOrder[idx] ?? null)
  const dataRows = hasHeaderRow ? cleaned.slice(1) : cleaned

  const out: ParsedYeucaImportRow[] = []
  dataRows.forEach((cells, idx) => {
    const record: Omit<ParsedYeucaImportRow, 'rowIndex' | 'valid' | 'reason'> = {
      studentNo: '',
      name: '',
      gradeMajorClass: '',
      department: '',
      roleTitle: '会员',
      term: '',
      phone: '',
      qq: '',
      email: '',
      gitUsername: '',
      notes: ''
    }

    cells.forEach((value, colIdx) => {
      const targetKey = colMap[colIdx]
      if (!targetKey || !value) return
      if (targetKey === 'gradeMajorClass' && record.gradeMajorClass) {
        record.gradeMajorClass = `${record.gradeMajorClass} ${value}`
      } else {
        record[targetKey] = value
      }
    })

    out.push(validateImportRow(record, idx + (hasHeaderRow ? 2 : 1)))
  })

  return out
}

/**
 * 解析粘贴文本（支持 Tab、逗号、中文逗号、竖线 | 分隔），首行自动识别表头或按默认列序导入。
 */
export function parsePastedTextToMemberImportRows(rawText: string): ParsedYeucaImportRow[] {
  const lines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const matrix = lines.map((line) => {
    if (line.includes('\t')) return line.split('\t')
    if (line.includes('|')) return line.split('|')
    if (line.includes(',') || line.includes('，')) return line.split(/[,，]/)
    return line.split(/\s+/)
  })

  return parseMatrixToMemberImportRows(matrix)
}
