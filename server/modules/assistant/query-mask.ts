/**
 * 把用户问题里的个人身份信息抹掉，落库/计数前调用。
 *
 * 问题明文入库的落点有两处：assistant_answer_cache.query（service.ts 的
 * cacheResponse）和 assistant 统计（analytics.ts）。原始 query 也会进
 * response_json，所以两处都要过这个函数。
 *
 * 只认「高置信度」的模式：宁可漏掉弱形态，也不要把「我是专升本的学生」这种正常
 * 问句遮成「我是专升本的学生」以外的样子——脱敏过头会让后台统计失去可读性。
 */

const MOBILE_RE = /(?<!\d)(1[3-9]\d{9})(?!\d)/g
const ID_CARD_RE = /(?<!\d)(\d{17}[\dXx])(?!\d)/g
const NUMBERED_ID_RE = /(学号|考号|准考证号|工号)(\s*(?:是|为)?\s*[:：]?\s*)([A-Za-z0-9]{4,20})/g
const NAME_RE = /(我叫|我的名字叫|名字叫|姓名\s*[:：]\s*|姓名是|姓名)([\u4E00-\u9FA5·]{2,4})(?=$|[\s，。,.!！?？、；;]|\d)/g

function maskMiddle(value: string, head: number, tail: number): string {
  const stars = Math.max(0, value.length - head - tail)
  return `${value.slice(0, head)}${'*'.repeat(stars)}${value.slice(value.length - tail)}`
}

export function maskAssistantQuery(value: string): string {
  if (!value) return ''
  return value
    .replace(ID_CARD_RE, match => maskMiddle(match, 6, 4))
    .replace(MOBILE_RE, match => maskMiddle(match, 3, 4))
    .replace(NUMBERED_ID_RE, (_match, label: string, space: string, serial: string) => `${label}${space}${maskMiddle(serial, 2, 2)}`)
    .replace(NAME_RE, (_match, prefix: string, name: string) => `${prefix}${maskMiddle(name, 1, 0)}`)
}

/** 落库列宽上限，脱敏后再截断，避免把半个星号截开。 */
export const ASSISTANT_STORED_QUERY_MAX_LENGTH = 300
