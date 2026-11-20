/**
 * 轻量安全 Markdown 转 HTML（只支持正文常用的标题、列表、加粗、行内代码、链接），
 * 先做 HTML 转义避免 XSS，不引入额外依赖。
 */
export function renderSimpleMarkdown(source: string): string {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const formatInline = (line: string) => {
    let out = escapeHtml(line);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return out;
  };

  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith('### ')) {
      closeList();
      html.push(`<h3>${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      continue;
    }

    const ulMatch = /^[-*]\s+(.+)$/.exec(line);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${formatInline(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}

export function formatMonthDay(isoDate: string): { month: string; day: string } {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return { month: isoDate, day: '--' };
  const monthNum = Number(parts[1]);
  const day = parts[2];
  return {
    month: `${Number.isFinite(monthNum) ? monthNum : parts[1]}月`,
    day,
  };
}
