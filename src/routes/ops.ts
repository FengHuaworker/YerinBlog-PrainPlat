/** 运维面板路由 */

import {
  adminTicket,
  currentOps,
  getSite,
  opsCookie,
  opsToken,
  purgeSiteFull,
  setSiteStatus,
  updateSite,
} from '../lib/platform';
import {
  DEFAULT_OPS,
  getOpsConfig,
  opsAllArticles,
  opsAllComments,
  opsDeleteArticle,
  opsDeleteComment,
  opsDeleteDomain,
  opsDomains,
  opsOverviewData,
  opsSites,
  opsSiteDetail,
  saveOpsConfig,
} from '../lib/ops';
import { baseDomain } from '../views/platform';
import { getQuota } from '../lib/quota';
import { opsContentPage, opsDomainsPage, opsLoginPage, opsOverviewPage, opsSettingsPage, opsSitesPage, opsSitePage } from '../views/ops';

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: HTML });
}

function redirect(location: string, cookie?: string): Response {
  const headers: Record<string, string> = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 302, headers });
}

function num(v: string | null, def: number): number {
  const n = Number(v || '');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export async function handleOps(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '') || '/ops';
  const method = req.method.toUpperCase();
  const base = baseDomain(env);
  const configured = !!env.OPS_PASSWORD;

  /* 登录 / 退出 */
  if (path === '/ops/login' && method === 'POST') {
    if (!configured) return html(opsLoginPage(env, false, '还没有配置 OPS_PASSWORD'), 500);
    const form = new URLSearchParams(await req.text());
    if (String(form.get('password') || '') !== env.OPS_PASSWORD) return html(opsLoginPage(env, true, '密码不正确'), 401);
    return redirect('/ops', opsCookie(await opsToken(env)));
  }
  if (path === '/ops/logout') return redirect('/', opsCookie(null));
  if (!(await currentOps(req, env))) return html(opsLoginPage(env, configured), configured ? 200 : 500);

  /* 站点操作（单个 / 批量） */
  if (path === '/ops/action' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const action = String(form.get('action') || '');
    const ids = form.getAll('id').map((s) => s.toLowerCase()).filter(Boolean);
    const back = String(form.get('back') || '');
    if (!ids.length) return redirect('/ops/sites?err=' + encodeURIComponent('没有选中博客'));
    let ok = 0;
    for (const id of ids) {
      const row = await getSite(env, id);
      if (!row) continue;
      if (action === 'enable' || action === 'disable') {
        await setSiteStatus(env, id, action === 'enable' ? 1 : 0);
        ok++;
      } else if (action === 'delete') {
        await purgeSiteFull(env, id);
        ok++;
      }
    }
    const msg = `${ok} 个博客已${action === 'delete' ? '删除' : action === 'enable' ? '启用' : '停用'}`;
    if (action === 'delete') return redirect('/ops/sites?ok=' + encodeURIComponent(msg));
    return redirect((back || '/ops/sites') + '?ok=' + encodeURIComponent(msg));
  }

  /* 单站资料 / 密码 */
  if (path === '/ops/site/update' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const id = String(form.get('id') || '').toLowerCase();
    const row = await getSite(env, id);
    if (!row) return redirect('/ops/sites?err=' + encodeURIComponent('没有这个博客'));
    await updateSite(env, id, { title: String(form.get('title') || '').trim() || id, intro: String(form.get('intro') || '').trim() });
    return redirect(`/ops/site/${encodeURIComponent(id)}?ok=` + encodeURIComponent('资料已保存'));
  }

  if (path === '/ops/site/password' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const id = String(form.get('id') || '').toLowerCase();
    const pwd = String(form.get('password') || '');
    const row = await getSite(env, id);
    if (!row) return redirect('/ops/sites?err=' + encodeURIComponent('没有这个博客'));
    if (pwd.length < 6) return redirect(`/ops/site/${encodeURIComponent(id)}?err=` + encodeURIComponent('密码至少 6 位'));
    await updateSite(env, id, { password: pwd });
    return redirect(`/ops/site/${encodeURIComponent(id)}?ok=` + encodeURIComponent('密码已重置'));
  }

  /* 进后台 */
  if (path === '/ops/enter') {
    const target = (url.searchParams.get('site') || '').toLowerCase();
    const row = target ? await getSite(env, target) : null;
    if (!row) return redirect('/ops/sites?err=' + encodeURIComponent('没有这个博客'));
    const ticket = await adminTicket(env, target);
    return redirect(`https://${target}.${base}/?admin/login&ticket=${encodeURIComponent(ticket)}`);
  }

  /* 内容删除 */
  if (path === '/ops/comment/delete' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    await opsDeleteComment(env, String(form.get('site') || ''), String(form.get('aid') || ''), num(form.get('id'), 0));
    return redirect('/ops/content?ok=' + encodeURIComponent('评论已删除'));
  }
  if (path === '/ops/article/delete' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    const site = String(form.get('site') || '');
    await opsDeleteArticle(env, site, String(form.get('id') || ''));
    return redirect('/ops/content?ok=' + encodeURIComponent('文章已删除'));
  }
  if (path === '/ops/domain/delete' && method === 'POST') {
    const form = new URLSearchParams(await req.text());
    await opsDeleteDomain(env, String(form.get('host') || ''));
    return redirect('/ops/domains?ok=' + encodeURIComponent('已解除绑定'));
  }

  /* 页面 */
  if (path === '/ops') {
    const data = await opsOverviewData(env);
    return html(
      opsOverviewPage(env, {
        ...data,
        cfg: await getOpsConfig(env),
        notice: url.searchParams.get('ok') || '',
        quota: await getQuota(env),
      })
    );
  }

  if (path === '/ops/sites') {
    const q = (url.searchParams.get('q') || '').trim();
    const status = url.searchParams.get('status') || '';
    const sort = url.searchParams.get('sort') || 'new';
    const page = num(url.searchParams.get('page'), 1);
    const res = await opsSites(env, { q, status, sort, page, size: 20 });
    return html(opsSitesPage(env, { ...res, q, status, sort }));
  }

  if (path.startsWith('/ops/site/')) {
    const id = decodeURIComponent(path.slice('/ops/site/'.length));
    const d = await opsSiteDetail(env, id);
    if (!d.site) return redirect('/ops/sites?err=' + encodeURIComponent('没有这个博客'));
    return html(
      opsSitePage(env, {
        ...d,
        site: d.site,
        notice: url.searchParams.get('ok') || '',
        error: url.searchParams.get('err') || '',
      })
    );
  }

  if (path === '/ops/content') {
    const tab = url.searchParams.get('tab') === 'articles' ? 'articles' : 'comments';
    const q = (url.searchParams.get('q') || '').trim();
    const page = num(url.searchParams.get('page'), 1);
    const res = tab === 'articles' ? await opsAllArticles(env, q, page, 20) : await opsAllComments(env, q, page, 20);
    return html(opsContentPage(env, { tab, q, ...res }));
  }

  if (path === '/ops/domains') {
    return html(opsDomainsPage(env, await opsDomains(env)));
  }

  if (path === '/ops/settings') {
    if (method === 'POST') {
      const form = new URLSearchParams(await req.text());
      await saveOpsConfig(env, {
        registration: form.get('registration') ? 1 : 0,
        ipLimit: Math.max(1, Math.min(100, num(form.get('ipLimit'), DEFAULT_OPS.ipLimit))),
        announcement: String(form.get('announcement') || '').trim(),
      });
      return redirect('/ops/settings?ok=' + encodeURIComponent('设置已保存'));
    }
    return html(opsSettingsPage(env, await getOpsConfig(env), url.searchParams.get('ok') || ''));
  }

  return redirect('/ops');
}
