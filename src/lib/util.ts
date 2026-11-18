/** 工具函数集：对照原版 lib/function.php */

export type AnyObj = Record<string, any>;

export const UTF8 = 'utf-8';

/** 转义 HTML（对照 htmlspecialchars / htmlentities） */
export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** 去标签（对照 strip_tags，保留原版“去掉 <...>”的行为） */
export function stripTags(str: unknown): string {
  return String(str ?? '').replace(/<[^>]*>/g, '');
}

/** 字符数（中文按 1 个字符） */
export function mbLen(str: unknown): number {
  return Array.from(String(str ?? '')).length;
}

export function mbSubstr(str: unknown, start: number, len?: number): string {
  const arr = Array.from(String(str ?? ''));
  if (start < 0) start = Math.max(0, arr.length + start);
  return arr.slice(start, len === undefined ? undefined : start + len).join('');
}

export function str2arr(str: unknown): string[] {
  return Array.from(String(str ?? ''));
}

/** 时间格式化：PRC 时区，Y-m-d H:i:s */
export function dates(timestamp = 0): string {
  const t = timestamp ? new Date(timestamp * 1000) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date(t.getTime() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function dateFmt(timestamp: number, fmt = 'Y-m-d H:i:s'): string {
  const d = new Date((timestamp || Math.floor(Date.now() / 1000)) * 1000 + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return fmt
    .replace(/Y/g, String(d.getUTCFullYear()))
    .replace(/m/g, p(d.getUTCMonth() + 1))
    .replace(/d/g, p(d.getUTCDate()))
    .replace(/H/g, p(d.getUTCHours()))
    .replace(/i/g, p(d.getUTCMinutes()))
    .replace(/s/g, p(d.getUTCSeconds()));
}

/** 友好时间：2天前 */
export function humanDate(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(timestamp || 0);
  if (seconds > 31536000) return `${new Date(timestamp * 1000).getUTCFullYear()}年前`;
  if (seconds > 2592000) return `${Math.floor(seconds / 2592000)}月前`;
  if (seconds > 86400) return `${Math.floor(seconds / 86400)}天前`;
  if (seconds > 3600) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds > 60) return `${Math.floor(seconds / 60)}分钟前`;
  return `${seconds}秒前`;
}

export function humanSize(size: number): string {
  if (size > 1073741824) return `${(size / 1073741824).toFixed(2)}G`;
  if (size > 1048576) return `${(size / 1048576).toFixed(2)}M`;
  if (size > 1024) return `${(size / 1024).toFixed(2)}K`;
  return `${size}B`;
}

export function randStr(len: number, type = 0): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    if (type === 1) out += chars[Math.floor(Math.random() * chars.length)];
    else if (type === 2) out += digits[Math.floor(Math.random() * digits.length)];
    else out += Math.random() < 0.5 ? chars[Math.floor(Math.random() * chars.length)] : digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

/** 数组排序（对照 arrSort） */
export function arrSort(arr: AnyObj, key: any, desc = true): AnyObj {
  if (Array.isArray(key)) {
    let list = arr;
    for (const k of key) list = arrSort(list, k, (key as any)[k]);
    return list;
  }
  const entries = Object.entries(arr || {});
  if (key === 1 || key === '1') {
    entries.sort((a, b) => (desc ? (b[1] as any) - (a[1] as any) : (a[1] as any) - (b[1] as any)));
  } else if (key === 0 || key === '0') {
    entries.sort((a, b) => (desc ? (b[1] as any) - (a[1] as any) : (a[1] as any) - (b[1] as any)));
  } else {
    entries.sort((a, b) => {
      const va = a[1]?.[key];
      const vb = b[1]?.[key];
      if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb;
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return desc ? (sa < sb ? 1 : sa > sb ? -1 : 0) : sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }
  const out: AnyObj = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

/** 条件筛选（对照 arrWhere，含 LIKE / IN / 比较） */
export function arrWhere(arr: AnyObj, cond: AnyObj = {}, orderby: AnyObj = {}, page = 0, pagesize = 0): AnyObj {
  if (!arr) return arr;
  let result: AnyObj = {};
  if (cond && Object.keys(cond).length) {
    for (const key of Object.keys(arr)) {
      const val = arr[key];
      let ok = true;
      for (const k of Object.keys(cond)) {
        const v = cond[k];
        if (val == null || !(k in val)) {
          ok = false;
          break;
        }
        if (typeof v !== 'object' || Array.isArray(v)) {
          if (Array.isArray(v)) {
            // 理论上不会走到这里
            if (String(val[k]) !== String(v)) {
              ok = false;
              break;
            }
          } else if (val[k] != v) {
            ok = false;
            break;
          }
        } else {
          for (const op of Object.keys(v)) {
            const target = v[op];
            const cur = val[k];
            let bad = false;
            switch (op) {
              case '>':
                bad = !(cur > target);
                break;
              case '<':
                bad = !(cur < target);
                break;
              case '>=':
                bad = !(cur >= target);
                break;
              case '<=':
                bad = !(cur <= target);
                break;
              case '==':
                bad = !(cur == target);
                break;
              case 'LIKE':
                bad = String(cur ?? '').toLowerCase().indexOf(String(target).toLowerCase()) === -1;
                break;
              case '!LIKE':
                bad = String(cur ?? '').toLowerCase().indexOf(String(target).toLowerCase()) !== -1;
                break;
              case 'IN':
                bad = !Array.isArray(cur) || !cur.map(String).includes(String(target));
                break;
              case '!IN':
                bad = Array.isArray(cur) && cur.map(String).includes(String(target));
                break;
            }
            if (bad) {
              ok = false;
              break;
            }
          }
          if (!ok) break;
        }
      }
      if (ok) result[key] = val;
    }
  } else {
    result = arr;
  }
  if (orderby && Object.keys(orderby).length) result = arrSort(result, orderby);
  if (page) {
    const start = (page - 1) * pagesize;
    result = arrSlice(result, start, pagesize);
  }
  return result;
}

export function arrSlice(arr: AnyObj, start: number, length = 0): AnyObj {
  if (Array.isArray(arr)) return arr.slice(start, length || undefined) as any;
  const keys = Object.keys(arr);
  const sliced = length ? keys.slice(start, start + length) : keys.slice(start);
  const out: AnyObj = {};
  for (const k of sliced) out[k] = arr[k];
  return out;
}

export function arrPages(data: AnyObj, page: number, pagesize = 20): AnyObj {
  if (!data || !page) return Array.isArray(data) ? [] : {};
  const keys = Object.keys(data);
  const start = (page - 1) * pagesize;
  if (start > keys.length) return Array.isArray(data) ? [] : {};
  const out: AnyObj = Array.isArray(data) ? [] : {};
  for (const k of keys.slice(start, start + pagesize)) (out as any)[k] = data[k];
  return out;
}

/** 分页 HTML（对照 pages） */
export function pages(url: string, totalnum: number, page: number, pagesize = 20): string {
  const totalpage = Math.ceil(totalnum / pagesize);
  if (totalpage < 2) return '';
  page = Math.min(totalpage, page);
  const shownum = 2;
  let start = Math.max(1, page - shownum);
  let end = Math.min(totalpage, page + shownum);
  const right = page + shownum - totalpage;
  if (right > 0) start = Math.max(1, start - right);
  const left = page - shownum;
  if (left < 0) end = Math.min(totalpage, end - left);
  let s = `<div class="paging"><a href="${page === 1 ? 'javascript:;' : url.replace('{page}', String(page - 1))}" class="paging-prev${page === 1 ? ' paging-disabled' : ''}">上一页</a>`;
  if (start > 1) s += `<a href="${url.replace('{page}', '1')}" class="paging-link">1</a>`;
  if (start > 2) s += '<span class="paging-ell">…</span>';
  for (let i = start; i <= end; i++) s += `<a href="${url.replace('{page}', String(i))}" class="paging-${i === page ? 'active' : 'link'}">${i}</a>`;
  if (totalpage - end > 1) s += '<span class="paging-ell">…</span>';
  if (end !== totalpage) s += `<a href="${url.replace('{page}', String(totalpage))}" class="paging-link">${totalpage}</a>`;
  return s + `<a href="${page === totalpage ? 'javascript:;' : url.replace('{page}', String(page + 1))}" class="paging-next${page === totalpage ? ' paging-disabled' : ''}">下一页</a></div>`;
}

export function pagesInit(url: string, totalnum: number, page: number, pagesize = 20): AnyObj {
  const totalpage = Math.ceil(totalnum / pagesize);
  const arr: AnyObj = {
    html: pages(url, totalnum, page, pagesize),
    count: totalnum,
    currentPage: page,
    countPage: totalpage,
    pageSize: pagesize,
    prev: '',
    prevUrl: '',
    newx: '',
    newxUrl: '',
    simple: '',
  };
  if (totalpage < 2) return arr;
  page = Math.min(totalpage, page);
  arr.prevUrl = page === 1 ? '' : url.replace('{page}', String(page - 1));
  arr.newxUrl = page === totalpage ? '' : url.replace('{page}', String(page + 1));
  arr.prev = `<a href="${page === 1 ? 'javascript:;' : arr.prevUrl}" class="paging-prev${page === 1 ? ' paging-disabled' : ''}">上一页</a>`;
  arr.newx = `<a href="${page === totalpage ? 'javascript:;' : arr.newxUrl}" class="paging-next${page === totalpage ? ' paging-disabled' : ''}">下一页</a>`;
  arr.simple = arr.prev + arr.newx;
  return arr;
}

/** 数组转树（评论用） */
export function arrTree(arr: AnyObj, id: number | string = 0, level = 0): AnyObj[] {
  const list: AnyObj[] = [];
  if (!arr) return list;
  const values = Array.isArray(arr) ? arr : Object.values(arr);
  for (const v of values) {
    if (v && v.pid == id) {
      const item = { ...v, level, child: arrTree(arr, v.id, level + 1) };
      list.push(item);
    }
  }
  return list;
}

/** 解析 application/x-www-form-urlencoded 或 query，支持 a[]=1&a[]=2 */
export function parseForm(raw: string): AnyObj {
  const out: AnyObj = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    if (k.endsWith('[]')) {
      const key = k.slice(0, -2);
      if (!Array.isArray(out[key])) out[key] = [];
      out[key].push(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 把 formData 转为对象（含 [] 数组与文件） */
export async function formDataToObj(fd: FormData): Promise<{ data: AnyObj; files: Record<string, File> }> {
  const data: AnyObj = {};
  const files: Record<string, File> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') {
      if (k.endsWith('[]')) {
        const key = k.slice(0, -2);
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(v);
      } else data[k] = v;
    } else {
      files[k] = v as File;
    }
  }
  return { data, files };
}

/** 路径安全化，防止 ../ 穿越 */
export function safePath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:/, '')
    .replace(/\.\.\//g, '')
    .replace(/^\/+/, '')
    .replace(/[?#]/g, '');
}

/** 取扩展名 */
export function extname(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/** MIME */
export function mimeOf(name: string): string {
  const ext = extname(name);
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    pdf: 'application/pdf',
    zip: 'application/zip',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

/** 布尔转换（对照 type($data,'bool')） */
export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === 'null' || s === '0' || s === '') return false;
  return Boolean(v);
}

/** PHP 风格 intval */
export function intval(v: unknown): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 计算 ceil 分页 */
export function ceilPage(total: number, size: number): number {
  return Math.ceil(total / (size || 1));
}

/** 简单防抖/串联用 key 生成 */
export function keyOf(...args: (string | number)[]): string {
  return args.join('_');
}
