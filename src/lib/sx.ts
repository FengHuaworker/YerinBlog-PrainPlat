/** .sx 应用包导入导出（移植 sx()/unsx()） */

import { safePath } from './util';

export interface SxPackage {
  header: Record<string, string>;
  files: { path: string; content: string }[];
  dirs: string[];
}

const HEADER_KEYS = ['id', 'type', 'name', 'intro', 'price', 'home', 'author', 'contact', 'version', 'limit'];

/** 解析 .sx 文本 */
export function parseSx(text: string): SxPackage {
  const out: SxPackage = { header: {}, files: [], dirs: [] };
  const content = String(text || '').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  // 头部注释
  for (const line of lines) {
    const m = /^#\s*(\w+)\s*:\s*(.*)$/.exec(line.trim());
    if (m && HEADER_KEYS.includes(m[1].toLowerCase())) {
      out.header[m[1].toLowerCase()] = m[2].trim();
    }
  }
  // 单行 base64 载荷
  const b64 = /^SX\.([A-Za-z0-9+/=\s]+)$/m.exec(content.trim());
  const body = b64 ? decodeURIComponent(escape(atob(b64[1].replace(/\s+/g, '')))) : content;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^#.*$/, '').trim();
    if (!line) continue;
    const m = /^\[(dir|file)\s(.*?)\]([\s\S]*)$/.exec(line);
    if (!m) continue;
    const p = m[2].replace(/\\/g, '/');
    if (p.startsWith('/') || p.includes('..')) continue;
    if (m[1] === 'dir') out.dirs.push(safePath(p));
    else {
      const value = m[3]
        .replace(/_@rn@_/g, '\r\n')
        .replace(/_@r@_/g, '\r')
        .replace(/_@n@_/g, '\n')
        .replace(/_@_/g, '@');
      out.files.push({ path: safePath(p), content: value });
    }
  }
  return out;
}

/** 生成 .sx 文本（导出） */
export function buildSx(header: Record<string, string>, files: { path: string; content: string }[]): string {
  let head = '# 清雨应用文件\n';
  for (const key of HEADER_KEYS) {
    if (header[key] !== undefined && header[key] !== '') head += `# ${key[0].toUpperCase()}${key.slice(1)}: ${header[key]}\n`;
  }
  head += '\n';
  let body = '';
  for (const f of files) {
    const escaped = String(f.content).replace(/@/g, '_@_').replace(/\r\n/g, '_@rn@_').replace(/\r/g, '_@r@_').replace(/\n/g, '_@n@_');
    body += `[file ${f.path}]${escaped}\n`;
  }
  return head + 'SX.' + btoa(unescape(encodeURIComponent(body.trim())));
}
