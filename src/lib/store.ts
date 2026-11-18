/** 模板 / 主题 / 扩展资源装载 */

import { siteOf } from './db';

import themeHeader from '../views/theme/header.html';
import themeFooter from '../views/theme/footer.html';
import themeIndex from '../views/theme/index.html';
import themePage from '../views/theme/page.html';
import themePrompt from '../views/theme/prompt.html';
import themeLogin from '../views/theme/login.html';

import adminHeader from '../views/admin/header.html';
import adminFooter from '../views/admin/footer.html';
import adminLogin from '../views/admin/login.html';
import adminPrompt from '../views/admin/prompt.html';
import adminIndex from '../views/admin/index.html';
import adminNavbar from '../views/admin/navbar.html';
import adminCategory from '../views/admin/category.html';
import adminLink from '../views/admin/link.html';
import adminArticle from '../views/admin/article.html';
import adminArticleCreate from '../views/admin/article.create.html';
import adminArticleEditor from '../views/admin/article.editor.html';
import adminSetting from '../views/admin/setting.html';
import adminTpl from '../views/admin/tpl.html';
import adminExt from '../views/admin/ext.html';
import adminError from '../views/admin/error.html';
import adminInstall from '../views/admin/install.html';
import adminApp from '../views/admin/app.html';

export const BUILTIN_THEME: Record<string, string> = {
  header: themeHeader,
  footer: themeFooter,
  index: themeIndex,
  page: themePage,
  prompt: themePrompt,
  login: themeLogin,
};

export const ADMIN_VIEWS: Record<string, string> = {
  header: adminHeader,
  footer: adminFooter,
  login: adminLogin,
  prompt: adminPrompt,
  index: adminIndex,
  navbar: adminNavbar,
  category: adminCategory,
  link: adminLink,
  article: adminArticle,
  'article.create': adminArticleCreate,
  'article.editor': adminArticleEditor,
  setting: adminSetting,
  tpl: adminTpl,
  ext: adminExt,
  error: adminError,
  install: adminInstall,
  app: adminApp,
};

export const DEFAULT_THEME_CONF = {
  id: 'default',
  type: 'tpl',
  author: '雪洛',
  name: '默认主题',
  intro: '官网默认主题。',
  price: 0,
  home: 'https://xueluo.cn',
  version: '1.1.0',
  limit: '1.2.0',
};

export const BUILTIN_EXT_CONF: Record<string, any> = {
  'fk-editor': {
    id: 'fk-editor',
    type: 'ext',
    author: '雪洛',
    name: 'fk标记语言编辑器',
    intro: 'fkEditor是一款简洁高效的fk标记语言编辑器，拥有高效便捷的快捷键，支持图片、附件上传。',
    price: 0,
    home: 'https://xueluo.cn',
    version: '1.0.6',
    limit: '1.0.0',
    hooks: {
      editor:
        '<link rel="stylesheet" href="{#HOME}ext/fk-editor/fk.css"/><script src="{#HOME}ext/fk-editor/fk.js"></script><script>SX.fkEditor("#content");</script>',
    },
  },
  app: {
    id: 'app',
    type: 'ext',
    author: '雪洛',
    name: '应用中心',
    intro: '本地应用中心：导入 / 导出主题与扩展，官方市场请访问 prain.cn。',
    price: 0,
    home: 'https://prain.cn',
    version: '1.1.0',
    limit: '1.0.0',
    hooks: {
      admin_sidebar_menu_3: '<a href="{url admin/app}">应用中心</a>',
    },
  },
};

/** 读取主题模板 */
export async function loadThemeTemplate(env: Env, tpl: string, name: string): Promise<string | null> {
  if (tpl === 'default') return BUILTIN_THEME[name] ?? null;
  const fromKv = await env.KV.get(`site:${siteOf(env)}:tpl:${tpl}:${name}.html`);
  if (fromKv != null) return fromKv;
  return null;
}

/** 读取后台模板 */
export function loadAdminTemplate(name: string): string | null {
  return ADMIN_VIEWS[name] ?? null;
}

/** 读取已安装主题的配置（不存在时用内置 default） */
export async function getThemeConf(env: Env, tpl: string): Promise<any> {
  if (tpl === 'default') return DEFAULT_THEME_CONF;
  const row = await env.DB.prepare('SELECT conf FROM pkg WHERE site=?1 AND type=?2 AND id=?3')
    .bind(siteOf(env), 'tpl', tpl)
    .first<{ conf: string }>();
  if (!row) return DEFAULT_THEME_CONF;
  try {
    return { ...DEFAULT_THEME_CONF, ...JSON.parse(row.conf) };
  } catch {
    return DEFAULT_THEME_CONF;
  }
}

/** 主题样式/图片资源：先查 KV，再回落到内置静态资源 */
export async function serveThemeAsset(env: Env, tpl: string, rest: string, req: Request): Promise<Response> {
  if (tpl !== 'default') {
    const obj = await env.KV.getWithMetadata(`site:${siteOf(env)}:tpl:${tpl}:${rest}`, 'arrayBuffer');
    if (obj.value) {
      const mime = guessMime(rest);
      return new Response(obj.value, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  }
  return env.ASSETS.fetch(new Request(new URL(`/tpl/default/${rest}`, req.url), req));
}

export async function serveExtAsset(env: Env, id: string, rest: string, req: Request): Promise<Response> {
  const obj = await env.KV.getWithMetadata(`site:${siteOf(env)}:ext:${id}:${rest}`, 'arrayBuffer');
  if (obj.value) {
    return new Response(obj.value, {
      headers: { 'Content-Type': guessMime(rest), 'Cache-Control': 'public, max-age=3600' },
    });
  }
  return env.ASSETS.fetch(new Request(new URL(`/ext/${id}/${rest}`, req.url), req));
}

export function guessMime(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    json: 'application/json; charset=utf-8',
    html: 'text/html; charset=utf-8',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return map[ext] || 'application/octet-stream';
}
