/** 平台数据层：站点注册、查询、统计、自定义域名、平台会话 */

import { DEFAULT_CONF, ensureInit, getConf, purgeSite, saveConf } from './db';
import { md5 } from './md5';
import { signToken, verifyToken } from './session';

export interface SiteRow {
  id: string;
  title: string;
  name: string;
  intro: string;
  password: string;
  email: string;
  ip: string;
  status: number;
  created: number;
  updated: number;
  domain: string;
}

const PLATFORM_COOKIE = 'prain_plat';
const OPS_COOKIE = 'prain_ops';
const SITE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export async function getSite(env: Env, id: string): Promise<SiteRow | null> {
  return env.DB.prepare('SELECT * FROM site WHERE id = ?1').bind(id).first<SiteRow>();
}

export async function countSites(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM site').first<{ n: number }>();
  return row?.n || 0;
}

export async function countSitesByIp(env: Env, ip: string, since: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM site WHERE ip = ?1 AND created > ?2').bind(ip, since).first<{ n: number }>();
  return row?.n || 0;
}

export async function listSites(env: Env, limit = 60, offset = 0): Promise<SiteRow[]> {
  const res = await env.DB.prepare('SELECT * FROM site WHERE status = 1 ORDER BY created DESC LIMIT ?1 OFFSET ?2').bind(limit, offset).all<SiteRow>();
  return res.results || [];
}

/** 自定义域名 → 站点 */
export async function resolveHost(env: Env, host: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT site FROM domain WHERE host = ?1 AND status = 1').bind(host.toLowerCase()).first<{ site: string }>();
  return row?.site || null;
}

/** 新建站点：写入 site 行 + 初始化该站的 Prain 数据 */
export async function createSite(
  env: Env,
  input: { id: string; title: string; password: string; intro?: string; ip?: string; email?: string }
): Promise<{ ok: boolean; message: string; site?: SiteRow }> {
  const id = input.id;
  if (!SITE_RE.test(id)) return { ok: false, message: '地址格式不正确' };
  const exists = await getSite(env, id);
  if (exists) return { ok: false, message: '这个地址已经被占用了' };

  const now = Math.floor(Date.now() / 1000);
  const title = input.title.trim() || id;
  const pwd = md5(input.password);
  await env.DB.prepare(
    "INSERT INTO site (id,title,name,intro,password,email,ip,status,created,updated,domain) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8,'')"
  )
    .bind(id, title, title, input.intro || '', pwd, input.email || '', input.ip || '', now)
    .run();

  // 用该站的 scoped env 初始化 Prain 数据
  const scoped: Env = { ...env, SITE: id };
  await ensureInit(scoped);
  const conf = { ...DEFAULT_CONF, ...(await getConf(scoped)) };
  conf.title = title;
  conf.name = title;
  conf.username = title;
  conf.intro = input.intro || '';
  conf.password = pwd;
  conf.install = true;
  conf.rewrite = true;
  await saveConf(scoped, conf);

  return { ok: true, message: '创建成功', site: (await getSite(env, id)) || undefined };
}

export async function updateSite(
  env: Env,
  id: string,
  patch: { title?: string; name?: string; intro?: string; password?: string; domain?: string }
): Promise<void> {
  const site = await getSite(env, id);
  if (!site) return;
  const now = Math.floor(Date.now() / 1000);
  const title = patch.title !== undefined ? patch.title : site.title;
  const name = patch.name !== undefined ? patch.name : site.name;
  const intro = patch.intro !== undefined ? patch.intro : site.intro;
  const pwd = patch.password ? md5(patch.password) : site.password;
  const domain = patch.domain !== undefined ? patch.domain : site.domain;
  await env.DB.prepare('UPDATE site SET title=?2,name=?3,intro=?4,password=?5,domain=?6,updated=?7 WHERE id=?1')
    .bind(id, title, name, intro, pwd, domain, now)
    .run();

  const scoped: Env = { ...env, SITE: id };
  const conf = await getConf(scoped);
  conf.title = title;
  conf.name = name;
  conf.intro = intro;
  conf.password = pwd;
  await saveConf(scoped, conf);
}

/** 绑定自定义域名（真正签发证书需要 CF for SaaS，这里只登记映射） */
export async function bindDomain(env: Env, site: string, host: string): Promise<{ ok: boolean; message: string }> {
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return { ok: false, message: '域名格式不正确' };
  const base = (env.BASE_DOMAIN || '').toLowerCase();
  if (base && (h === base || h.endsWith('.' + base))) return { ok: false, message: '不需要绑定平台子域，直接用即可' };
  const used = await env.DB.prepare('SELECT site FROM domain WHERE host = ?1').bind(h).first<{ site: string }>();
  if (used && used.site !== site) return { ok: false, message: '该域名已被其他博客绑定' };
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('INSERT INTO domain (host,site,status,created) VALUES (?1,?2,1,?3) ON CONFLICT(host) DO UPDATE SET site=excluded.site')
    .bind(h, site, now)
    .run();
  await env.DB.prepare('UPDATE site SET domain=?2,updated=?3 WHERE id=?1').bind(site, h, now).run();
  return { ok: true, message: '已登记，证书签发后生效' };
}

export async function unbindDomain(env: Env, site: string): Promise<void> {
  const row = await getSite(env, site);
  if (!row?.domain) return;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM domain WHERE site = ?1').bind(site),
    env.DB.prepare("UPDATE site SET domain='' WHERE id = ?1").bind(site),
  ]);
}

export async function siteStats(env: Env, site: string): Promise<{ articles: number; comments: number; views: number }> {
  const a = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(views),0) AS v FROM article WHERE site = ?1').bind(site).first<{ n: number; v: number }>();
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM comment WHERE site = ?1').bind(site).first<{ n: number }>();
  return { articles: a?.n || 0, views: a?.v || 0, comments: c?.n || 0 };
}

/** 删站：DB 行 + 该站 KV 文件（主题、扩展、上传） */
export async function purgeSiteFull(env: Env, site: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page: any = await env.KV.list({ prefix: `site:${site}:`, cursor });
    for (const k of page.keys || []) await env.KV.delete(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  await purgeSite(env, site);
}

/* ---------- 平台会话 ---------- */

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function platformLogin(env: Env, site: string): Promise<string> {
  return signToken(env, { scope: 'platform', site }, 60 * 60 * 24 * 14);
}

export async function currentSite(req: Request, env: Env): Promise<string | null> {
  const data = await verifyToken(env, readCookie(req, PLATFORM_COOKIE));
  if (!data || data.scope !== 'platform' || !data.site) return null;
  return String(data.site);
}

export function platformCookie(token: string | null): string {
  if (!token) return `${PLATFORM_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return `${PLATFORM_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

/** 进入某个博客后台的短期票据 */
export async function adminTicket(env: Env, site: string): Promise<string> {
  return signToken(env, { scope: 'admin', site }, 300);
}


/* ---------- 平台总管理（运维） ---------- */

export async function setSiteStatus(env: Env, id: string, status: number): Promise<void> {
  await env.DB.prepare('UPDATE site SET status=?2, updated=?3 WHERE id=?1').bind(id, status, Math.floor(Date.now() / 1000)).run();
}

export async function globalStats(env: Env): Promise<{ sites: number; articles: number; comments: number; views: number; disabled: number }> {
  const a = await env.DB.prepare('SELECT COUNT(*) AS sites, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) AS disabled FROM site').first<any>();
  const b = await env.DB.prepare('SELECT COUNT(*) AS articles, COALESCE(SUM(views),0) AS views FROM article').first<any>();
  const c = await env.DB.prepare('SELECT COUNT(*) AS comments FROM comment').first<any>();
  return {
    sites: a?.sites || 0,
    disabled: a?.disabled || 0,
    articles: b?.articles || 0,
    views: b?.views || 0,
    comments: c?.comments || 0,
  };
}

export interface OpsSiteRow extends SiteRow {
  articles: number;
  comments: number;
  views: number;
}

export async function opsListSites(env: Env, q = '', limit = 200): Promise<OpsSiteRow[]> {
  const kw = `%${q}%`;
  const res = await env.DB.prepare(
    `SELECT s.*,
       (SELECT COUNT(*) FROM article a WHERE a.site=s.id) AS articles,
       (SELECT COUNT(*) FROM comment c WHERE c.site=s.id) AS comments,
       (SELECT COALESCE(SUM(views),0) FROM article a WHERE a.site=s.id) AS views
     FROM site s
     WHERE s.id LIKE ?1 OR s.title LIKE ?1 OR s.domain LIKE ?1
     ORDER BY s.created DESC LIMIT ?2`
  )
    .bind(kw, limit)
    .all<OpsSiteRow>();
  return res.results || [];
}

export async function opsToken(env: Env): Promise<string> {
  // 把密码指纹放进令牌：改密码后旧会话立即失效
  return signToken(env, { scope: 'ops', v: md5(env.OPS_PASSWORD || '') }, 60 * 60 * 24 * 7);
}

export async function currentOps(req: Request, env: Env): Promise<boolean> {
  const data = await verifyToken(env, readCookie(req, OPS_COOKIE));
  return !!data && data.scope === 'ops' && data.v === md5(env.OPS_PASSWORD || '');
}

export function opsCookie(token: string | null): string {
  if (!token) return `${OPS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return `${OPS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}
