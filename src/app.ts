/** 请求上下文、初始化与总调度 */

import schemaSql from '../schema.sql';
import { buildHooks } from './lib/hooks';
import { getConf, getIniAll, ensureInit, saveConf, siteOf } from './lib/db';
import { getSite, resolveHost } from './lib/platform';
import { classifyHost } from './lib/subdomain';
import { notFoundPage } from './views/platform';
import { defaultFunctions, setMd5 } from './lib/expr';
import { md5 } from './lib/md5';
import { Session, clientIp, getToken, loadSession, sessionCookie } from './lib/session';
import { ADMIN_VIEWS, BUILTIN_THEME, loadAdminTemplate, loadThemeTemplate } from './lib/store';
import { renderSource } from './lib/tpl';
import { AnyObj, formDataToObj, parseForm } from './lib/util';
import { handleFront } from './routes/front';
import { handleAdmin } from './routes/admin';
import { handlePlatform } from './routes/platform';

setMd5(md5);

let schemaReady = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (schemaReady) return;
  try {
    await env.DB.prepare('SELECT 1 FROM conf LIMIT 1').first();
    // 老库增量表：每次冷启动补一次，失败忽略
    try {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS platform_conf (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)').run();
    } catch {
      // ignore
    }
    schemaReady = true;
    return;
  } catch {
    const cleaned = schemaSql.replace(/^\s*--.*$/gm, '');
    const stmts = cleaned
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (stmts.length) await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
    schemaReady = true;
  }
}

export class Ctx {
  req: Request;
  env: Env;
  url: URL;
  parts: string[] = [];
  query: Record<string, string> = {};
  post: AnyObj = {};
  files: Record<string, File> = {};
  conf: AnyObj = {};
  session!: Session;
  ini: AnyObj = {};
  hooks: Record<string, string> = {};
  start = Date.now();
  ip = '';
  login = false;
  ajax = false;
  method = 'GET';
  forceLogout = false;
  colo = '';
  /** 当前站点标识（租户子域 / main） */
  site = 'main';

  constructor(req: Request, env: Env) {
    this.req = req;
    this.env = env;
    this.url = new URL(req.url);
    this.method = req.method.toUpperCase();
    this.site = (env as any).SITE || 'main';
  }

  async init(): Promise<void> {
    this.ip = clientIp(this.req);
    this.ajax = (this.req.headers.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
    this.colo = (this.req as any).cf?.colo || 'CF';
    this.conf = await getConf(this.env);
    this.session = await loadSession(this.req, this.env, this.ip);
    this.ini = await getIniAll(this.env);
    this.login = this.session.login;
    this.parseRoute();
    if (this.method === 'POST') {
      const ct = this.req.headers.get('Content-Type') || '';
      try {
        if (ct.includes('application/json')) {
          this.post = await this.req.json();
        } else if (ct.includes('multipart/form-data')) {
          const fd = await this.req.formData();
          const { data, files } = await formDataToObj(fd);
          this.post = data;
          this.files = files;
        } else {
          this.post = parseForm(await this.req.text());
        }
      } catch {
        this.post = {};
      }
    }
    // 登录 token 校验（对照原版 getToken 逻辑）
    if (this.login && this.session.data.token !== getToken(this.req, this.ip)) {
      this.session.destroy();
      this.forceLogout = true;
      this.login = false;
    }
    this.hooks = await buildHooks(this.env, this.conf);
  }

  private parseRoute(): void {
    const pathPart = decodeURIComponent(this.url.pathname).replace(/^\/+/, '');
    const searchPart = this.url.search ? this.url.search.slice(1) : '';
    // 还原原版 get()：URL 常量是 '/?' 时，问号属于“基址”，需拼回去再切分
    let raw = this.conf.rewrite ? pathPart + (searchPart ? '?' + searchPart : '') : pathPart + searchPart;
    raw = raw.replace(/^\?/, '');
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // 保留原样
    }
    let route = raw;
    let paramsStr = '';
    const q = raw.indexOf('?');
    if (q >= 0) {
      route = raw.slice(0, q);
      paramsStr = raw.slice(q + 1);
    } else {
      const amp = raw.indexOf('&');
      if (amp >= 0) {
        route = raw.slice(0, amp);
        paramsStr = raw.slice(amp + 1);
      }
    }
    this.parts = route.split('/').filter(Boolean);
    const params = new URLSearchParams(paramsStr);
    params.forEach((v, k) => (this.query[k] = v));
  }

  get(i: number, def = ''): string {
    return this.parts[i] !== undefined ? this.parts[i] : def;
  }

  q(key: string, def = ''): string {
    return this.query[key] !== undefined ? this.query[key] : def;
  }

  p(key: string, def: any = ''): any {
    return this.post[key] !== undefined ? this.post[key] : def;
  }

  get home(): string {
    return '/';
  }

  get urlBase(): string {
    return this.conf.rewrite ? '/' : '/?';
  }

  constants(): AnyObj {
    const tpl = this.conf.tpl || 'default';
    return {
      V: '1.3.4',
      ROOT: '',
      HOME: '/',
      URL: this.urlBase,
      DB: 'db/',
      EXT: 'ext/',
      LIB: 'lib/',
      TPL: `tpl/${tpl}/`,
      TPLPATH: '',
      TPL_STYLE: `/tpl/${tpl}/style/`,
      TPL_IMG: `/tpl/${tpl}/img/`,
      LIB_STYLE: '/lib/style/',
      LOGIN: this.login,
      DEBUG: this.conf.debug,
      API_HOST: 'https://prain.cn/api/',
      COLO: this.colo,
      DIRECTORY_SEPARATOR: '/',
      PHP_VERSION: 'worker',
    };
  }

  functions(): Record<string, (...args: any[]) => any> {
    return defaultFunctions({
      ip: () => this.ip,
      getRunTime: () => ((Date.now() - this.start) / 1000).toFixed(4),
      getMemory: () => String(Math.round((typeof (performance as any)?.memory?.usedJSHeapSize === 'number' ? (performance as any).memory.usedJSHeapSize : 0) / 1024)),
      host: () => this.host(),
    });
  }

  host(): string {
    return this.url.origin;
  }

  scope(extra: AnyObj = {}): AnyObj {
    return {
      conf: this.conf,
      ini: this.ini,
      _SESSION: this.session.data,
      method: this.method,
      ajax: this.ajax,
      host: this.host(),
      url: this.url.pathname + this.url.search,
      page: '',
      extList: this.conf.ext || {},
      ...extra,
    };
  }

  async renderTheme(view: string, extra: AnyObj = {}): Promise<string> {
    const tpl = this.conf.tpl || 'default';
    const ver = tpl === 'default' ? 'builtin' : (await this.env.KV.get(`site:${siteOf(this.env)}:tpl:ver:${tpl}`)) || '0';
    let src = await loadThemeTemplate(this.env, tpl, view);
    if (src == null) src = BUILTIN_THEME[view] ?? null;
    if (src == null) src = BUILTIN_THEME['index'];
    if (src == null) return '模板不存在: ' + view;
    return renderSource(src, {
      ns: `theme:${tpl}:${ver}`,
      scope: this.scope(extra),
      constants: this.constants(),
      functions: this.functions(),
      hooks: this.hooks,
      load: async (name, kind) => {
        if (kind === 'admin') return loadAdminTemplate(name);
        if (kind === 'tpl') return (await loadThemeTemplate(this.env, tpl, name)) ?? null;
        return (await loadThemeTemplate(this.env, tpl, name)) ?? (tpl === 'default' ? BUILTIN_THEME[name] ?? null : null);
      },
    });
  }

  async renderAdmin(view: string, extra: AnyObj = {}): Promise<string> {
    const src = loadAdminTemplate(view) ?? ADMIN_VIEWS['index'];
    return renderSource(src, {
      ns: 'admin',
      scope: this.scope(extra),
      constants: this.constants(),
      functions: this.functions(),
      hooks: this.hooks,
      load: async (name, kind) => (kind === 'admin' || kind === 'plain' ? loadAdminTemplate(name) : await loadThemeTemplate(this.env, this.conf.tpl, name)),
    });
  }

  async finish(body: BodyInit | null, init: ResponseInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && typeof body === 'string') headers.set('Content-Type', 'text/html; charset=utf-8');
    if (this.session && this.session.dirty) headers.append('Set-Cookie', await sessionCookie(this.session, this.env));
    return new Response(body, { ...init, headers });
  }

  async html(body: string, status = 200, headers: Record<string, string> = {}): Promise<Response> {
    // 匿名访客允许浏览器缓存 30 秒，减少重复请求（免费额度只有 10 万/天）
    const cache = this.login ? 'no-store' : 'private, max-age=30, stale-while-revalidate=60';
    return this.finish(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, ...headers } });
  }

  async json(obj: any, status = 200, headers: Record<string, string> = {}): Promise<Response> {
    return this.finish(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
    });
  }

  async redirect(location: string, status = 302): Promise<Response> {
    return this.finish(null, { status, headers: { Location: location } });
  }

  async jump(path = ''): Promise<Response> {
    return this.redirect(this.urlBase + path);
  }

  /** 提示页（原版 prompt()） */
  async prompt(text = '', url: string | false = false, inAdmin = false): Promise<Response> {
    const view = inAdmin ? 'prompt' : 'prompt';
    const html = inAdmin
      ? await this.renderAdmin('prompt', { prompt: text, url: url || '' })
      : await this.renderTheme('prompt', { prompt: text, url: url || '' });
    return this.html(html);
  }

  async errorPage(text: string): Promise<Response> {
    return this.html(`<div style="padding:40px;font-family:sans-serif"><h3>${text}</h3></div>`, 500);
  }
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith('/lib/') ||
    pathname.startsWith('/ext/') ||
    pathname.startsWith('/tpl/') ||
    pathname.startsWith('/db/upload/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  );
}


/** 演示站守卫：只开放前台。后台（/admin、?admin/...、/ops）需先用 ?demo=KEY 解锁 */
const DEMO_COOKIE = 'prain_demo';

function demoGuard(req: Request, env: any): Response | null {
  const key = env.DEMO_ADMIN_KEY as string | undefined;
  if (!key) return null;
  const url = new URL(req.url);

  const given = url.searchParams.get('demo');
  if (given === key) {
    const clean = new URL(url.toString());
    clean.searchParams.delete('demo');
    return new Response(null, {
      status: 302,
      headers: {
        Location: clean.pathname + (clean.search || ''),
        'Set-Cookie': `${DEMO_COOKIE}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      },
    });
  }

  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  const isAdminQuery = Array.from(url.searchParams.keys()).some((k) => k === 'admin' || k.startsWith('admin/'));
  const isOps = url.pathname === '/ops' || url.pathname.startsWith('/ops/');
  if (!isAdminPath && !isAdminQuery && !isOps) return null;

  const cookie = req.headers.get('Cookie') || '';
  const ok = cookie.split(';').some((c) => c.trim() === `${DEMO_COOKIE}=${key}`);
  if (ok) return null;

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>404 Not Found</title>' +
      '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f8fb;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#3d434f">' +
      '<div style="font-size:72px;font-weight:300;letter-spacing:.04em">404</div>' +
      '<div style="margin-top:8px;color:#8a90a0">页面不存在</div>' +
      '<a href="/" style="margin-top:24px;color:#5b6fd6;text-decoration:none">返回首页</a></div>',
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function handleRequest(req: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const guarded = demoGuard(req, env);
  if (guarded) return guarded;
  const pathname = url.pathname;
  const host = url.hostname.toLowerCase();
  const base = (env.BASE_DOMAIN || 'example.com').toLowerCase();
  const info = classifyHost(host, base);
  // 允许平台控制面挂在指定子域（演示站 prain.* 用；正式站不设置此变量）
  const platformHost = String((env as any).PLATFORM_HOST || '').toLowerCase();
  const isPlatformHost = !!platformHost && host === platformHost;
  // 本地调试 / workers.dev 预览一律走平台
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.workers.dev');

  // 保留名（admin / my / dashboard …）统一 302 回平台根域
  if (info.kind === 'reserved' && !isPlatformHost) {
    const target = `https://${base}${url.pathname === '/' ? '/' : url.pathname}${url.search}`;
    return new Response(null, { status: 302, headers: { Location: target } });
  }

  let scoped: Env = env;
  try {
    await ensureSchema(env);

    // 平台控制面（根域 / 本地调试）
    if (info.kind === 'platform' || isPlatformHost || isLocal) {
      return await handlePlatform(req, env);
    }

    // 租户：一级子域，或已登记的自定义域名
    let site: string | null = info.kind === 'tenant' ? info.label || null : null;
    if (!site) site = await resolveHost(env, host);
    if (!site) {
      return new Response(notFoundPage(env, null, '这个博客不存在'), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const row = await getSite(env, site);
    if (!row) {
      return new Response(notFoundPage(env, null, '这个博客不存在'), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (!row.status) {
      return new Response(notFoundPage(env, null, '这个博客已被停用'), {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    scoped = { ...env, SITE: site };

    // 静态资源：上传文件、已安装主题 / 扩展
    try {
      if (isStaticPath(pathname)) {
        const segs = pathname.split('/').filter(Boolean);
        if (segs[0] === 'tpl' && segs.length >= 3) {
          const { serveThemeAsset } = await import('./lib/store');
          return serveThemeAsset(scoped, segs[1], segs.slice(2).join('/'), req);
        }
        if (segs[0] === 'ext' && segs.length >= 3) {
          const { serveExtAsset } = await import('./lib/store');
          return serveExtAsset(scoped, segs[1], segs.slice(2).join('/'), req);
        }
        if (segs[0] === 'db' && segs[1] === 'upload') {
          const { serveUpload } = await import('./lib/upload');
          return serveUpload(scoped, segs.join('/'));
        }
        // /lib/img/... 可能是后台上传的头像，优先读 KV
        if (segs[0] === 'lib') {
          const { serveUpload } = await import('./lib/upload');
          const up = await serveUpload(scoped, segs.join('/'));
          if (up.status !== 404) return up;
        }
        return env.ASSETS.fetch(req);
      }
    } catch (e) {
      // 继续走动态路由
    }

    await ensureInit(scoped);
    const conf0 = await getConf(scoped);
    if (!conf0.install) {
      conf0.install = true;
      await saveConf(scoped, conf0);
    }

    const ctx = new Ctx(req, scoped);
    await ctx.init();

    // 前端脚本用：POST getConf
    if (ctx.method === 'POST' && ctx.p('getConf')) {
      return ctx.json({ error: false, message: '操作成功', data: { HOST: ctx.host(), HOME: '/', URL: ctx.urlBase } });
    }

    if (ctx.forceLogout) return ctx.jump();

    // IP 黑名单
    if (ctx.conf.blacklist) {
      const list = String(ctx.conf.blacklist).split(' ').filter(Boolean);
      for (const item of list) {
        try {
          if (item.includes('/')) {
            const m = /^\/(.*)\/[a-z]*$/.exec(item);
            if (m && new RegExp(m[1]).test(ctx.ip)) return ctx.html('你的IP被系统拉入黑名单，如需解除，请联系管理员！', 403);
          } else if (ctx.ip === item) {
            return ctx.html('你的IP被系统拉入黑名单，如需解除，请联系管理员！', 403);
          }
        } catch {
          // 忽略非法正则
        }
      }
    }

    // 全站浏览量（每个会话一次）
    if (!ctx.session.data.isVisit) {
      ctx.session.set('isVisit', 1);
      await saveConf(scoped, { ...ctx.conf, views: (Number(ctx.conf.views) || 0) + 1 });
      ctx.conf.views = (Number(ctx.conf.views) || 0) + 1;
    }

    const page = ctx.get(0, 'index');
    const adminPage = ctx.get(1, 'index');
    if (page === 'admin') {
      return handleAdmin(ctx, adminPage);
    }
    return handleFront(ctx, page);
  } catch (e: any) {
    const msg = e?.stack || e?.message || String(e);
    try {
      const { addError } = await import('./lib/db');
      await addError(scoped, clientIp(req), req.url, String(msg).slice(0, 2000));
    } catch {
      // ignore
    }
    return new Response(`<div style="font-family:monospace;padding:24px"><h3>Prain Worker Error</h3><pre>${String(msg).replace(/</g, '&lt;')}</pre></div>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** 安装流程 */
async function handleInstall(ctx: Ctx): Promise<Response> {
  if (ctx.method === 'POST') {
    const conf = { ...ctx.conf };
    conf.title = ctx.p('title', conf.title);
    conf.name = ctx.p('name', conf.name);
    conf.intro = ctx.p('intro', conf.intro);
    const pwd = String(ctx.p('password', '') || '');
    if (pwd) conf.password = md5(pwd);
    conf.install = true;
    await saveConf(ctx.env, conf);
    ctx.conf = conf;
    return ctx.jump();
  }
  const html = await ctx.renderAdmin('install', { conf: ctx.conf });
  return ctx.html(html);
}
