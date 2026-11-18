/** 文件上传：D1 记索引 + KV 存内容（原版 GD 缩略图不再生成） */

import { addFile, getFile, siteOf } from './db';
import { extname, mimeOf, safePath } from './util';

export interface UploadResult {
  error: boolean;
  message: string;
  data?: string[];
}

const DEFAULT_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'pdf', 'zip', 'rar', '7z', 'txt', 'md', 'mp3', 'mp4', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function handleUpload(env: Env, post: Record<string, any>, files: Record<string, File>): Promise<UploadResult> {
  const inputName = String(post.inputName || 'file');
  const file = files[inputName] || files['file'];
  if (!file) return { error: true, message: '未选择文件' };

  const pathParam = String(post.path || `db/upload/${new Date().getFullYear()}${pad(new Date().getMonth() + 1)}/`);
  const basePath = safePath(pathParam).replace(/\/?$/, '/');
  const nameType = String(post.nameType || 'time');
  const fixedName = post.name;
  const maxKb = Number(post.size || 2048) || 2048;
  const allowExtRaw = post.ext;
  const allowExt = allowExtRaw
    ? String(allowExtRaw)
        .split(/[,\s|]+/)
        .map((s) => s.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean)
    : DEFAULT_EXT;

  const ext = extname(file.name) || 'bin';
  if (!allowExt.includes(ext)) return { error: true, message: `不允许上传 ${ext} 类型的文件` };
  if (file.size > maxKb * 1024) return { error: true, message: `文件大小不能超过 ${maxKb}KB` };
  if (file.size > 25 * 1024 * 1024) return { error: true, message: '单个文件不能超过 25MB（KV 限制）' };

  let filename: string;
  if (fixedName) {
    filename = safePath(String(fixedName));
  } else if (nameType === 'time') {
    filename = `${Date.now()}${Math.floor(Math.random() * 1000)}.${ext}`;
  } else if (nameType === 'rand') {
    filename = `${Math.random().toString(36).slice(2, 10)}.${ext}`;
  } else {
    filename = safePath(file.name);
  }
  const path = basePath + filename;
  const kvkey = `site:${siteOf(env)}:upload:${path}`;
  const buf = await file.arrayBuffer();
  await env.KV.put(kvkey, buf, { metadata: { mime: file.type || mimeOf(path), size: file.size } });
  await addFile(env, { path, name: file.name, size: file.size, mime: file.type || mimeOf(path), kvkey });
  return { error: false, message: '上传成功', data: ['/' + path] };
}

/** 读取上传文件 */
export async function serveUpload(env: Env, path: string): Promise<Response> {
  const clean = safePath(path);
  const kvkey = `site:${siteOf(env)}:upload:${clean}`;
  const obj = await env.KV.getWithMetadata<{ mime?: string }>(kvkey, 'arrayBuffer');
  if (!obj.value) {
    const row = await getFile(env, clean);
    if (row) {
      const retry = await env.KV.getWithMetadata<{ mime?: string }>(row.kvkey, 'arrayBuffer');
      if (retry.value) {
        return new Response(retry.value, {
          headers: { 'Content-Type': retry.metadata?.mime || row.mime || mimeOf(clean), 'Cache-Control': 'public, max-age=86400' },
        });
      }
    }
    return new Response('Not Found', { status: 404 });
  }
  const mime = obj.metadata?.mime || mimeOf(clean);
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };
  // 上传的 SVG 直接访问时禁止脚本执行
  if (mime.includes('svg')) headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
  return new Response(obj.value, { headers });
}
