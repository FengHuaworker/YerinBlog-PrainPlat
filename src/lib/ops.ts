/** 运维面板数据层 */

import { getConf, saveConf } from './db';
import { SiteRow } from './platform';

export interface OpsConfig {
  registration: number;
  announcement: string;
  ipLimit: number;
}

export const DEFAULT_OPS: OpsConfig = { registration: 1, announcement: '', ipLimit: 5 };

export async function getOpsConfig(env: Env): Promise<OpsConfig> {
  const row = await env.DB.prepare('SELECT data FROM platform_conf WHERE id = 1').first<{ data: string }>();
  if (!row) return { ...DEFAULT_OPS };
  try {
    return { ...DEFAULT_OPS, ...JSON.parse(row.data) };
  } catch {
    return { ...DEFAULT_OPS };
  }
}

export async function saveOpsConfig(env: Env, patch: Partial<OpsConfig>): Promise<OpsConfig> {
  const cur = await getOpsConfig(env);
  const next = { ...cur, ...patch };
  await env.DB.prepare('INSERT INTO platform_conf (id,data) VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
    .bind(JSON.stringify(next))
    .run();
  return next;
}

export interface OpsTotals {
  sites: number;
  active: number;
  disabled: number;
  articles: number;
  comments: number;
  views: number;
  files: number;
  bytes: number;
  errors24h: number;
  today: number;
}

export async function opsTotals(env: Env): Promise<OpsTotals> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const s = await env.DB.prepare(
    'SELECT COUNT(*) AS sites, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) AS disabled, SUM(CASE WHEN created>?1 THEN 1 ELSE 0 END) AS today FROM site'
  )
    .bind(dayAgo)
    .first<any>();
  const a = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(views),0) AS v FROM article').first<any>();
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM comment').first<any>();
  const f = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS b FROM file').first<any>();
  const e = await env.DB.prepare('SELECT COUNT(*) AS n FROM error WHERE time>?1').bind(dayAgo).first<any>();
  return {
    sites: s?.sites || 0,
    active: s?.active || 0,
    disabled: s?.disabled || 0,
    today: s?.today || 0,
    articles: a?.n || 0,
    views: a?.v || 0,
    comments: c?.n || 0,
    files: f?.n || 0,
    bytes: f?.b || 0,
    errors24h: e?.n || 0,
  };
}

/** 近 7 天注册量（PRC 日期） */
export async function opsTrend(env: Env): Promise<{ day: string; n: number }[]> {
  const since = Math.floor(Date.now() / 1000) - 86400 * 6;
  const res = await env.DB.prepare(
    "SELECT date(created,'unixepoch','+8 hours') AS day, COUNT(*) AS n FROM site WHERE created>?1 GROUP BY day ORDER BY day"
  )
    .bind(since)
    .all<{ day: string; n: number }>();
  const map = new Map((res.results || []).map((r) => [r.day, r.n]));
  const out: { day: string; n: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - i * 86400 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, n: map.get(key) || 0 });
  }
  return out;
}

export async function opsTopSites(env: Env, limit = 6): Promise<any[]> {
  const res = await env.DB.prepare(
    `SELECT s.id, s.title, COUNT(a.id) AS articles, COALESCE(SUM(a.views),0) AS views, COALESCE(SUM(a.comments),0) AS comments
     FROM site s LEFT JOIN article a ON a.site = s.id
     GROUP BY s.id ORDER BY views DESC LIMIT ?1`
  )
    .bind(limit)
    .all<any>();
  return res.results || [];
}

export async function opsRecentSites(env: Env, limit = 8): Promise<any[]> {
  const res = await env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM article a WHERE a.site=s.id) AS articles
     FROM site s ORDER BY s.created DESC LIMIT ?1`
  )
    .bind(limit)
    .all<any>();
  return res.results || [];
}

export async function opsRecentComments(env: Env, limit = 8): Promise<any[]> {
  const res = await env.DB.prepare(
    `SELECT c.*, a.title AS articleTitle, s.title AS siteTitle
     FROM comment c LEFT JOIN article a ON a.site=c.site AND a.id=c.aid
     LEFT JOIN site s ON s.id=c.site
     ORDER BY c.time DESC LIMIT ?1`
  )
    .bind(limit)
    .all<any>();
  return res.results || [];
}

/** 概览页一次性取数 */
export async function opsOverviewData(env: Env): Promise<{ totals: any; trend: { day: string; n: number }[]; top: any[]; recentSites: any[]; recentComments: any[] }> {
  const [totals, trend, top, recentSites, recentComments] = await Promise.all([
    opsTotals(env),
    opsTrend(env),
    opsTopSites(env, 8),
    opsRecentSites(env, 8),
    opsRecentComments(env, 8),
  ]);
  return { totals, trend, top, recentSites, recentComments };
}

export interface SiteQuery {
  q?: string;
  status?: string;
  sort?: string;
  page?: number;
  size?: number;
}

export async function opsSites(env: Env, q: SiteQuery): Promise<{ rows: any[]; total: number; page: number; pages: number }> {
  const size = Math.min(100, Math.max(10, q.size || 20));
  const page = Math.max(1, q.page || 1);
  const where: string[] = [];
  const binds: any[] = [];
  if (q.q) {
    where.push('(s.id LIKE ?1 OR s.title LIKE ?1 OR s.domain LIKE ?1)');
    binds.push(`%${q.q}%`);
  }
  if (q.status === 'active') where.push('s.status = 1');
  if (q.status === 'disabled') where.push('s.status = 0');
  if (q.status === 'domain') where.push("s.domain != ''");
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM site s ${clause}`)
    .bind(...binds)
    .first<{ n: number }>();
  const total = countRow?.n || 0;

  const order =
    q.sort === 'old'
      ? 's.created ASC'
      : q.sort === 'views'
      ? 'views DESC, s.created DESC'
      : q.sort === 'articles'
      ? 'articles DESC, s.created DESC'
      : 's.created DESC';

  const offset = (page - 1) * size;
  const sql = `SELECT s.*,
      (SELECT COUNT(*) FROM article a WHERE a.site=s.id) AS articles,
      (SELECT COUNT(*) FROM comment c WHERE c.site=s.id) AS comments,
      (SELECT COALESCE(SUM(a.views),0) FROM article a WHERE a.site=s.id) AS views
    FROM site s ${clause} ORDER BY ${order} LIMIT ${size} OFFSET ${offset}`;
  const res = await env.DB.prepare(sql).bind(...binds).all<any>();
  return { rows: res.results || [], total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function opsSiteDetail(env: Env, id: string): Promise<{ site: SiteRow | null; articles: any[]; comments: any[] }> {
  const site = await env.DB.prepare('SELECT * FROM site WHERE id=?1').bind(id).first<SiteRow>();
  if (!site) return { site: null, articles: [], comments: [] };
  const articles = await env.DB.prepare(
    'SELECT id,title,cid,views,comments,createTime,isPrivate,isComment FROM article WHERE site=?1 ORDER BY createTime DESC LIMIT 200'
  )
    .bind(id)
    .all<any>();
  const comments = await env.DB.prepare('SELECT * FROM comment WHERE site=?1 ORDER BY time DESC LIMIT 200').bind(id).all<any>();
  return { site, articles: articles.results || [], comments: comments.results || [] };
}

export async function opsAllComments(env: Env, q = '', page = 1, size = 20): Promise<{ rows: any[]; total: number; page: number; pages: number }> {
  const kw = `%${q}%`;
  const where = q ? 'WHERE c.content LIKE ?1 OR c.name LIKE ?1 OR c.site LIKE ?1' : '';
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM comment c ${where}`)
    .bind(...(q ? [kw] : []))
    .first<{ n: number }>();
  const total = totalRow?.n || 0;
  const offset = (page - 1) * size;
  const res = await env.DB.prepare(
    `SELECT c.*, a.title AS articleTitle, s.title AS siteTitle
     FROM comment c LEFT JOIN article a ON a.site=c.site AND a.id=c.aid
     LEFT JOIN site s ON s.id=c.site ${where}
     ORDER BY c.time DESC LIMIT ${size} OFFSET ${offset}`
  )
    .bind(...(q ? [kw] : []))
    .all<any>();
  return { rows: res.results || [], total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function opsAllArticles(env: Env, q = '', page = 1, size = 20): Promise<{ rows: any[]; total: number; page: number; pages: number }> {
  const kw = `%${q}%`;
  const where = q ? 'WHERE a.title LIKE ?1 OR a.site LIKE ?1' : '';
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM article a ${where}`)
    .bind(...(q ? [kw] : []))
    .first<{ n: number }>();
  const total = totalRow?.n || 0;
  const offset = (page - 1) * size;
  const res = await env.DB.prepare(
    `SELECT a.id,a.site,a.title,a.views,a.comments,a.createTime,a.isPrivate, s.title AS siteTitle
     FROM article a LEFT JOIN site s ON s.id=a.site ${where}
     ORDER BY a.createTime DESC LIMIT ${size} OFFSET ${offset}`
  )
    .bind(...(q ? [kw] : []))
    .all<any>();
  return { rows: res.results || [], total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function opsDomains(env: Env): Promise<any[]> {
  const res = await env.DB.prepare(
    'SELECT d.*, s.title AS siteTitle FROM domain d LEFT JOIN site s ON s.id=d.site ORDER BY d.created DESC LIMIT 500'
  ).all<any>();
  return res.results || [];
}

/** 删除评论并把文章评论数重新算一遍 */
export async function opsDeleteComment(env: Env, site: string, aid: string, id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comment WHERE site=?1 AND aid=?2 AND id=?3').bind(site, aid, id),
    env.DB.prepare('DELETE FROM comment WHERE site=?1 AND aid=?2 AND pid=?3').bind(site, aid, id),
    env.DB.prepare('UPDATE article SET comments=(SELECT COUNT(*) FROM comment c WHERE c.site=?1 AND c.aid=?2) WHERE site=?1 AND id=?2').bind(site, aid),
  ]);
}

export async function opsDeleteArticle(env: Env, site: string, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM article WHERE site=?1 AND id=?2').bind(site, id),
    env.DB.prepare('DELETE FROM comment WHERE site=?1 AND aid=?2').bind(site, id),
  ]);
  await recountSite(env, site);
}

export async function opsDeleteDomain(env: Env, host: string): Promise<void> {
  const row = await env.DB.prepare('SELECT site FROM domain WHERE host=?1').bind(host).first<{ site: string }>();
  await env.DB.prepare('DELETE FROM domain WHERE host=?1').bind(host).run();
  if (row) await env.DB.prepare("UPDATE site SET domain='' WHERE id=?1 AND domain=?2").bind(row.site, host).run();
}

/** 重算某站的文章/评论/分类/标签计数 */
export async function recountSite(env: Env, site: string): Promise<void> {
  const scoped: Env = { ...env, SITE: site };
  const conf = await getConf(scoped);
  const arts = await env.DB.prepare('SELECT cid, tag FROM article WHERE site=?1').bind(site).all<{ cid: string; tag: string }>();
  const rows = arts.results || [];
  const tags: Record<string, number> = {};
  const cats: Record<string, number> = {};
  for (const r of rows) {
    cats[r.cid] = (cats[r.cid] || 0) + 1;
    let list: string[] = [];
    try {
      list = JSON.parse(r.tag || '[]');
    } catch {
      list = [];
    }
    for (const t of list) tags[t] = (tags[t] || 0) + 1;
  }
  const comment = await env.DB.prepare('SELECT COUNT(*) AS n FROM comment WHERE site=?1').bind(site).first<{ n: number }>();
  const category = { ...(conf.category || {}) };
  for (const k of Object.keys(category)) category[k] = { ...category[k], count: cats[k] || 0 };
  conf.article = { ...(conf.article || {}), count: rows.length };
  conf.comment = { ...(conf.comment || {}), count: comment?.n || 0 };
  conf.tag = tags;
  conf.category = category;
  await saveConf(scoped, conf);
}

/** 简单分页条 */
export function opsPaging(base: string, page: number, pages: number): string {
  if (pages <= 1) return '';
  const items: string[] = [];
  const push = (p: number, label: string, active = false) => {
    items.push(`<a class="ops-page${active ? ' active' : ''}" href="${base}${p}">${label}</a>`);
  };
  if (page > 1) push(page - 1, '上一页');
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let p = start; p <= end; p++) push(p, String(p), p === page);
  if (page < pages) push(page + 1, '下一页');
  return `<div class="ops-paging">${items.join('')}<span class="muted">共 ${pages} 页</span></div>`;
}
