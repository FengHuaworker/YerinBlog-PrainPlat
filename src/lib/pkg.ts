/** 应用包管理：主题 / 扩展的安装、删除、导入、导出 */

import { deletePkg, getPkg, listPkgs, savePkg, siteOf } from './db';
import { SxPackage, buildSx, parseSx } from './sx';
import { extname, safePath } from './util';

/** 站点隔离的 KV 前缀 */
function kvPrefix(env: Env, type: string, id: string): string {
  return `site:${siteOf(env)}:${type}:${id}:`;
}

/** PHP 模板 → Prain Worker 模板（尽力转换常见写法） */
export function phpToTpl(src: string): { content: string; warnings: number } {
  let out = String(src || '');
  let warnings = 0;
  out = out.replace(/<\?php\s+exit\([^)]*\);?\s*\?>/gi, '');
  out = out.replace(/<\?php([\s\S]*?)\?>/g, (_m, codeRaw: string) => {
    const code = codeRaw.trim();
    if (!code) return '';
    // echo
    let m = /^echo\s+([\s\S]+?);?$/.exec(code);
    if (m) {
      let expr = m[1].trim().replace(/;$/, '');
      if (/^\$/.test(expr)) return `{${expr}}`;
      if (/^[A-Z_][A-Z0-9_]*$/.test(expr)) return `{#${expr}}`;
      return `{${expr}}`;
    }
    // if
    m = /^if\s*\(([\s\S]+?)\)\s*[:{]$/.exec(code);
    if (m) return `{if ${m[1]}}`;
    m = /^\}\s*elseif\s*\(([\s\S]+?)\)\s*[:{]$/.exec(code);
    if (m) return `{elseif ${m[1]}}`;
    if (/^\}\s*else\s*[:{]$/.test(code) || /^else\s*:$/.test(code)) return '{else}';
    if (/^endif;?$/.test(code) || /^\}$/.test(code)) return '{/if}';
    // foreach
    m = /^foreach\s*\(([\s\S]+?)\)\s*[:{]$/.exec(code);
    if (m) return `{foreach ${m[1]}}`;
    if (/^endforeach;?$/.test(code)) return '{/foreach}';
    // include
    m = /^include\s+TPL_?[A-Z]*\s*\.\s*['"]compile\/(.+?)\.php['"];?$/.exec(code);
    if (m) return `{include ${m[1]}}`;
    m = /^include\s+LIB\s*\.\s*['"]admin\/compile\/(.+?)\.php['"];?$/.exec(code);
    if (m) return `{include admin ${m[1]}}`;
    // 变量赋值
    if (/^\$[\w\[\]'"\->.]+\s*=/.test(code)) return `{{ ${code} }}`;
    warnings++;
    return `<!-- unp: ${code.replace(/-->/g, '')} -->`;
  });
  return { content: out, warnings };
}

export interface ImportOutcome {
  ok: boolean;
  message: string;
  type?: string;
  id?: string;
  warnings?: number;
}

/** 导入 .sx 文本 */
export async function importSx(env: Env, sxText: string, hintType = 'system'): Promise<ImportOutcome> {
  const pkg: SxPackage = parseSx(sxText);
  const header = pkg.header;
  const id = header.id;
  if (!id) return { ok: false, message: '应用缺少Id' };
  if (!/^[a-zA-Z]+[a-zA-Z0-9_-]+$/.test(id)) return { ok: false, message: '应用Id格式不正确' };
  if (id.length < 1 || id.length > 30) return { ok: false, message: '应用Id长度限制1-30' };
  const type = header.type || hintType;
  if (!['tpl', 'ext', 'system'].includes(type)) return { ok: false, message: '应用Type不正确' };
  if (header.limit) {
    const need = Number(String(header.limit).replace(/\./g, ''));
    const cur = Number('134');
    if (need > cur) return { ok: false, message: `你的清雨版本太低，无法安装使用，需要升级到v${header.limit}及以上` };
  }
  if (!pkg.files.length) return { ok: false, message: '应用包内没有文件' };

  const prefix = kvPrefix(env, type, id);
  const stored: string[] = [];
  let warnings = 0;
  for (const f of pkg.files) {
    let path = f.path;
    let content = f.content;
    // 去掉包里的顶层目录名（有的包会套一层）
    if (path.startsWith(`${id}/`)) path = path.slice(id.length + 1);
    if (extname(path) === 'php') {
      const converted = phpToTpl(content);
      warnings += converted.warnings;
      content = converted.content;
      path = path.replace(/\.php$/i, '.html');
    }
    await env.KV.put(prefix + path, content);
    stored.push(path);
  }
  const conf = {
    id,
    type,
    name: header.name || id,
    intro: header.intro || '',
    version: header.version || '1.0.0',
    author: header.author || '',
    home: header.home || '',
    price: header.price || 0,
    limit: header.limit || '',
    contact: header.contact || '',
    hooks: buildHooksFromFiles(pkg),
  };
  const pkgType = type === 'system' ? 'ext' : type;
  await savePkg(env, pkgType, id, conf, stored, 0);
  await env.KV.put(`site:${siteOf(env)}:${pkgType === 'tpl' ? 'tpl' : 'ext'}:ver:${id}`, String(Date.now()));
  return { ok: true, message: '导入成功', type, id, warnings };
}

function buildHooksFromFiles(pkg: SxPackage): Record<string, string> {
  const hookFile = pkg.files.find((f) => /(^|\/)hook\.json$/i.test(f.path));
  if (!hookFile) return {};
  try {
    return JSON.parse(hookFile.content);
  } catch {
    return {};
  }
}

/** 导出为 .sx */
export async function exportSx(env: Env, type: 'tpl' | 'ext', id: string): Promise<{ filename: string; content: string } | null> {
  const pkg = await getPkg(env, type, id);
  if (!pkg) {
    if (type === 'tpl' && id === 'default') {
      const { BUILTIN_THEME, DEFAULT_THEME_CONF } = await import('./store');
      const files = Object.entries(BUILTIN_THEME).map(([name, content]) => ({ path: `${name}.html`, content }));
      const header: Record<string, string> = {
        id: 'default',
        type: 'tpl',
        name: DEFAULT_THEME_CONF.name,
        intro: DEFAULT_THEME_CONF.intro,
        version: DEFAULT_THEME_CONF.version,
        author: DEFAULT_THEME_CONF.author,
        home: DEFAULT_THEME_CONF.home,
        price: '0',
        limit: DEFAULT_THEME_CONF.limit,
      };
      return { filename: 'default.sx', content: buildSx(header, files) };
    }
    return null;
  }
  const files: { path: string; content: string }[] = [];
  const prefix = kvPrefix(env, type, id);
  for (const p of pkg.files || []) {
    const content = await env.KV.get(prefix + p);
    if (content != null) files.push({ path: p, content });
  }
  const header: Record<string, string> = {
    id,
    type,
    name: pkg.conf?.name || id,
    intro: pkg.conf?.intro || '',
    version: pkg.conf?.version || '',
    author: pkg.conf?.author || '',
    home: pkg.conf?.home || '',
    price: String(pkg.conf?.price ?? 0),
    limit: pkg.conf?.limit || '',
  };
  return { filename: `${id}.sx`, content: buildSx(header, files) };
}

/** 删除应用包与其 KV 文件 */
export async function removePkg(env: Env, type: 'tpl' | 'ext', id: string): Promise<void> {
  const pkg = await getPkg(env, type, id);
  const prefix = kvPrefix(env, type, id);
  if (pkg) {
    for (const p of pkg.files || []) await env.KV.delete(prefix + p);
  }
  await deletePkg(env, type, id);
}

/** 主题列表（内置 default + 已导入） */
export async function themeList(env: Env, activeTpl: string): Promise<any> {
  const { DEFAULT_THEME_CONF } = await import('./store');
  const list: Record<string, any> = {};
  const add = (conf: any) => {
    list[conf.id] = { ...conf, icon: `/tpl/${conf.id}/icon.png`, setting: !!conf.setting };
  };
  add({ ...DEFAULT_THEME_CONF, setting: false });
  for (const pkg of await listPkgs(env, 'tpl')) {
    const setting = await env.KV.get(`site:${siteOf(env)}:tpl:${pkg.id}:setting.html`);
    add({ ...pkg.conf, id: pkg.id, setting: !!setting });
  }
  const ordered: Record<string, any> = {};
  if (list[activeTpl]) ordered[activeTpl] = list[activeTpl];
  for (const k of Object.keys(list)) if (!ordered[k]) ordered[k] = list[k];
  return { list: ordered, count: Object.keys(ordered).length };
}

/** 扩展列表（内置 + 已导入），按安装状态分组 */
export async function extList(env: Env, installed: Record<string, any>): Promise<any> {
  const { BUILTIN_EXT_CONF } = await import('./store');
  const all: Record<string, any> = {};
  for (const [id, conf] of Object.entries(BUILTIN_EXT_CONF)) {
    all[id] = { ...(conf as any), icon: `/ext/${id}/icon.png`, setting: false };
  }
  for (const pkg of await listPkgs(env, 'ext')) {
    const setting = await env.KV.get(`site:${siteOf(env)}:ext:${pkg.id}:setting.html`);
    all[pkg.id] = { ...pkg.conf, id: pkg.id, icon: `/ext/${pkg.id}/icon.png`, setting: !!setting };
  }
  const installList: Record<string, any> = {};
  const notInstallList: Record<string, any> = {};
  for (const [id, conf] of Object.entries(all)) {
    if (installed && installed[id]) installList[id] = conf;
    else notInstallList[id] = conf;
  }
  return {
    list: { ...installList, ...notInstallList },
    installList,
    notInstallList,
    installCount: Object.keys(installList).length,
    count: Object.keys(all).length,
  };
}

/** 写入主题设置模板（扩展设置页用） */
export async function pkgFileExists(env: Env, type: 'tpl' | 'ext', id: string, path: string): Promise<boolean> {
  const key = `site:${siteOf(env)}:${type}:${id}:${safePath(path)}`;
  return (await env.KV.get(key)) !== null;
}
