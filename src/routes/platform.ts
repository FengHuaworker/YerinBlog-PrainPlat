/** 平台控制面路由（根域） */

import { md5 } from '../lib/md5';
import {
  adminTicket,
  bindDomain,
  countSites,
  countSitesByIp,
  createSite,
  currentSite,
  getSite,
  listSites,
  platformCookie,
  platformLogin,
  purgeSiteFull,
  siteStats,
  unbindDomain,
  updateSite,
} from '../lib/platform';
import { clientIp } from '../lib/session';
import { normalizeSubdomain, platformRedirect, validateSubdomain } from '../lib/subdomain';
import { escapeHtml, parseForm } from '../lib/util';
import { getOpsConfig } from '../lib/ops';
import { getQuota } from '../lib/quota';
import { handleOps } from './ops';
import { aboutPage, baseDomain, browsePage, dashboard, home, layout, loginPage, notFoundPage, platformName, promptPage } from '../views/platform';

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
const PAGE_CACHE = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' };

function html(body: string, status = 200, headers: Record<string, string> = HTML): Response {
  return new Response(body, { status, headers });
}

function redirect(location: string, cookie?: string): Response {
  const headers: Record<string, string> = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 302, headers });
}

async function readPost(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    try {
      return (await req.json()) as any;
    } catch {
      return {};
    }
  }
  try {
    return parseForm(await req.text());
  } catch {
    return {};
  }
}

function str(v: any): string {
  return v === undefined || v === null ? '' : String(v);
}

export async function handlePlatform(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  const base = baseDomain(env);
  let site = await currentSite(req, env);
  // 会话里的站点被删除后自动失效
  if (site && !(await getSite(env, site))) site = null;

  /* ---------- API ---------- */
  if (path === '/api/check') {
    const name = normalizeSubdomain(url.searchParams.get('name') || '');
    const check = validateSubdomain(name);
    if (!check.ok) return json({ ok: false, name, reason: check.reason });
    if (await getSite(env, name)) return json({ ok: false, name, reason: '这个地址已经被占用了' });
    return json({ ok: true, name });
  }

  if (path === '/health') {
    return json({ ok: true, sites: await countSites(env) });
  }

  if (path === '/api/quota') {
    const q = await getQuota(env);
    return json(q, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  /* ---------- 注册 ---------- */
  if (path === '/register' && method === 'POST') {
    const post = await readPost(req);
    const name = normalizeSubdomain(str(post.name));
    const title = str(post.title).trim();
    const password = str(post.password);
    const password2 = str(post.password2);

    const check = validateSubdomain(name);
    if (!check.ok) return html(promptPage(env, site, `地址不可用：${check.reason}`, '/#create'), 400);
    if (password.length < 6) return html(promptPage(env, site, '密码至少 6 位', '/#create'), 400);
    if (password !== password2) return html(promptPage(env, site, '两次输入的密码不一致', '/#create'), 400);
    if (!post.agree) return html(promptPage(env, site, '请先确认已知晓免费额度说明', '/#create'), 400);

    const cfg = await getOpsConfig(env);
    if (!cfg.registration) return html(promptPage(env, site, '平台暂时关闭注册，请稍后再来', '/'), 403);

    const ip = clientIp(req);
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    if ((await countSitesByIp(env, ip, dayAgo)) >= cfg.ipLimit) {
      return html(promptPage(env, site, `同一个 IP 每天最多创建 ${cfg.ipLimit} 个博客`, '/'), 429);
    }

    const created = await createSite(env, { id: name, title, password, ip });
    if (!created.ok) return html(promptPage(env, site, created.message, '/#create'), 400);

    const token = await platformLogin(env, name);
    return redirect('/dashboard', platformCookie(token));
  }

  /* ---------- 登录 ---------- */
  if (path === '/login') {
    if (method === 'POST') {
      const post = await readPost(req);
      const name = normalizeSubdomain(str(post.name));
      const password = str(post.password);
      const row = await getSite(env, name);
      if (!row) return html(loginPage(env, site, '没有这个博客'), 404);
      if (!row.status) return html(loginPage(env, site, '这个博客已被停用'), 403);
      if (!password || md5(password) !== row.password) return html(loginPage(env, site, '密码不正确'), 401);
      const token = await platformLogin(env, name);
      return redirect('/dashboard', platformCookie(token));
    }
    return html(loginPage(env, site));
  }

  if (path === '/logout') {
    return redirect('/', platformCookie(null));
  }

  /* ---------- 控制台 ---------- */
  if (path === '/dashboard') {
    if (!site) return redirect('/login');
    const row = await getSite(env, site);
    if (!row) return redirect('/logout');
    const stats = await siteStats(env, site);
    const notice = url.searchParams.get('ok') || '';
    const error = url.searchParams.get('err') || '';
    return html(dashboard(env, row, stats, notice, error));
  }

  if (path === '/dashboard/setting' && method === 'POST') {
    if (!site) return redirect('/login');
    const post = await readPost(req);
    const password = str(post.password);
    if (password && password.length < 6) return redirect('/dashboard?err=' + encodeURIComponent('新密码至少 6 位'));
    await updateSite(env, site, {
      title: str(post.title).trim() || site,
      name: str(post.name).trim() || str(post.title).trim() || site,
      intro: str(post.intro).trim(),
      password: password || undefined,
    });
    return redirect('/dashboard?ok=' + encodeURIComponent('已保存'));
  }

  if (path === '/dashboard/domain' && method === 'POST') {
    if (!site) return redirect('/login');
    const post = await readPost(req);
    const domain = str(post.domain).trim();
    if (!domain) {
      await unbindDomain(env, site);
      return redirect('/dashboard?ok=' + encodeURIComponent('已解除绑定'));
    }
    const r = await bindDomain(env, site, domain);
    if (!r.ok) return redirect('/dashboard?err=' + encodeURIComponent(r.message));
    return redirect('/dashboard?ok=' + encodeURIComponent(r.message));
  }

  if (path === '/dashboard/delete' && method === 'POST') {
    if (!site) return redirect('/login');
    const post = await readPost(req);
    const row = await getSite(env, site);
    if (!row) return redirect('/logout');
    if (md5(str(post.password)) !== row.password) {
      return redirect('/dashboard?err=' + encodeURIComponent('密码不正确，未删除'));
    }
    await purgeSiteFull(env, site);
    return redirect('/', platformCookie(null));
  }

  /* ---------- 进入博客后台（签发短期票据） ---------- */
  if (path === '/enter') {
    if (!site) return redirect('/login');
    const ticket = await adminTicket(env, site);
    const target = `https://${site}.${base}/?admin/login&ticket=${encodeURIComponent(ticket)}`;
    return redirect(target);
  }

  /* ---------- 运维面板 ---------- */
  if (path === '/ops' || path.startsWith('/ops/')) {
    return handleOps(req, env, url);
  }

  /* ---------- 公开页面 ---------- */
  if (path === '/') {
    const total = await countSites(env);
    const recent = await listSites(env, 6);
    const cfg = await getOpsConfig(env);
    const quota = await getQuota(env);
    return html(home(env, site, total, recent, cfg.announcement, cfg.registration === 1, quota), 200, PAGE_CACHE);
  }

  if (path === '/browse') {
    const total = await countSites(env);
    const sites = await listSites(env, 120);
    return html(browsePage(env, site, sites, total), 200, PAGE_CACHE);
  }

  if (path === '/about') {
    const total = await countSites(env);
    return html(aboutPage(env, site, total), 200, PAGE_CACHE);
  }

  // 任何平台域名下的保留路径都回首页
  return html(notFoundPage(env, site, '页面不存在'), 404);
}

function json(obj: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
