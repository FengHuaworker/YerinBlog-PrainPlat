/** 运维面板页面 */

import { escapeHtml } from '../lib/util';
import type { SiteRow } from '../lib/platform';
import { baseDomain, platformName } from './platform';
import type { QuotaInfo } from '../lib/quota';

const OPS_CSS = `
*{box-sizing:border-box}
body{background:#f0f2f6}
.ops-shell{display:flex;min-height:100vh}
.ops-side{width:208px;flex:0 0 208px;background:#2c3140;color:#c7cddb;position:fixed;top:0;bottom:0;left:0;display:flex;flex-direction:column;z-index:10}
.ops-logo{display:flex;align-items:center;gap:8px;padding:18px 18px 16px;color:#fff;font-size:17px;font-weight:700;letter-spacing:.5px}
.ops-logo img{height:18px}
.ops-logo small{display:block;font-size:11px;color:#8b93a7;font-weight:400;letter-spacing:0;margin-top:2px}
.ops-nav{padding:6px 0;flex:1}
.ops-nav a{display:flex;align-items:center;gap:8px;padding:10px 18px;color:#c7cddb;font-size:14px;border-left:3px solid transparent}
.ops-nav a:hover{background:#353b4d;color:#fff;text-decoration:none}
.ops-nav a.active{background:#353b4d;color:#fff;border-left-color:#7485e3}
.ops-nav .sep{height:1px;background:#3a4053;margin:10px 18px}
.ops-nav .muted{color:#7f879b;font-size:12px;padding:0 18px}
.ops-main{margin-left:208px;flex:1;min-width:0;padding:20px 24px 30px}
.ops-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.ops-top h1{font-size:21px;color:#2f3442;font-weight:700}
.ops-top .sub{color:#8a90a0;font-size:13px;margin-top:4px}
.ops-top .acts{display:flex;gap:8px;flex-wrap:wrap}
.ops-card{background:#fff;border-radius:5px;box-shadow:0 1px 4px rgb(25 35 60 / 6%);margin-bottom:16px}
.ops-card-h{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid #f0f1f5;font-weight:700;color:#3b4152;flex-wrap:wrap}
.ops-card-b{padding:16px}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px}
.kpi{background:#fff;border-radius:5px;padding:14px 16px;box-shadow:0 1px 4px rgb(25 35 60 / 6%)}
.kpi b{display:block;font-size:23px;color:#2f3442;line-height:30px}
.kpi span{font-size:12px;color:#8a90a0}
.kpi em{font-style:normal;font-size:11px;color:#7485e3;margin-left:4px}
.dash{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.dash>.col{flex:1;min-width:320px}
table.t{width:100%;border-collapse:collapse;font-size:13px}
table.t th{background:#f8f9fc;color:#6a7183;font-weight:400;text-align:left;padding:9px 12px;border-bottom:1px solid #eceef4;white-space:nowrap}
table.t td{padding:9px 12px;border-bottom:1px solid #f5f6fa;vertical-align:middle;color:#3f4553}
table.t tr:hover td{background:#fbfcff}
table.t .num{color:#8a90a0;font-size:12px}
.badge{display:inline-block;font-size:12px;padding:1px 8px;border-radius:10px;background:#eaf7ee;color:#2e9e5b;white-space:nowrap}
.badge.off{background:#fdeceb;color:#d9534f}
.badge.gray{background:#f1f2f6;color:#6a7183}
.tag{display:inline-block;font-size:12px;padding:1px 7px;border-radius:3px;background:#f2f4fb;color:#5c6a92}
.mono{font-family:Consolas,Menlo,monospace}
.ell{max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ops-btn{display:inline-block;height:28px;line-height:26px;padding:0 14px;border:1px solid #d7dae4;border-radius:3px;background:#fff;color:#4c535f;font-size:13px;cursor:pointer;text-decoration:none}
.ops-btn:hover{border-color:#b9bfd0;color:#2f3442;text-decoration:none}
.ops-btn.primary{background:#5b6fd6;border-color:#5b6fd6;color:#fff}
.ops-btn.primary:hover{background:#4c60c7;color:#fff}
.ops-btn.danger{color:#d9534f;border-color:#f0cdcd}
.ops-btn.danger:hover{background:#fff5f5}
.ops-btn.sm{height:24px;line-height:22px;padding:0 9px;font-size:12px}
.ops-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #f0f1f5}
.ops-toolbar input[type=text],.ops-toolbar select{height:30px;line-height:30px;font-size:13px}
.ops-toolbar input[type=text]{width:220px}
.ops-toolbar .spacer{flex:1}
.ops-paging{display:flex;gap:6px;align-items:center;padding:12px 16px;flex-wrap:wrap}
.ops-page{display:inline-block;min-width:28px;height:28px;line-height:26px;text-align:center;padding:0 8px;border:1px solid #dde0e8;border-radius:3px;font-size:13px;color:#4c535f}
.ops-page.active{background:#5b6fd6;border-color:#5b6fd6;color:#fff}
.bars{display:flex;align-items:flex-end;gap:10px;height:120px;padding:6px 4px 0}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;height:100%}
.bar i{display:block;width:100%;background:linear-gradient(180deg,#8f9ff0,#6b7ee0);border-radius:3px 3px 0 0;min-height:2px}
.bar span{font-size:11px;color:#8a90a0;white-space:nowrap}
.ops-login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f0f2f6}
.ops-login{width:360px;background:#fff;border-radius:6px;box-shadow:0 6px 30px rgb(30 40 70 / 10%);padding:28px 26px}
.ops-login h2{font-size:19px;color:#2f3442;margin-bottom:6px}
.ops-login p{color:#8a90a0;font-size:13px;margin-bottom:18px}
.ops-login input[type=password]{width:100%;height:36px;line-height:36px;margin-bottom:12px}
.ops-login .ops-btn{width:100%;height:36px;line-height:34px;text-align:center}
.qbar{height:9px;border-radius:5px;background:#eef0f6;overflow:hidden;margin:9px 0 7px}
.qbar i{display:block;height:100%;border-radius:5px;background:#5b6fd6}
.qrow{display:flex;justify-content:space-between;font-size:13px;color:#6a7183}
.qrow b{color:#2f3442}
.notice{background:#fff8e6;border:1px solid #f5e2b3;color:#8a6d3b;padding:9px 12px;border-radius:3px;font-size:13px;line-height:20px}
.notice.blue{background:#f2f5ff;border-color:#dbe2fb;color:#4d5d8a}
.notice.red{background:#fff5f5;border-color:#f3d6d6;color:#a94442}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.meta div{background:#f8f9fc;border-radius:4px;padding:10px 12px}
.meta b{display:block;color:#2f3442;font-size:14px;margin-top:3px;word-break:break-all}
.meta span{font-size:12px;color:#8a90a0}
.form-line{display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.form-line label{width:88px;flex:0 0 88px;color:#5b5e70;font-size:13px;text-align:right}
.form-line input[type=text],.form-line input[type=password],.form-line input[type=number]{height:30px;line-height:30px;font-size:13px;flex:1;max-width:320px}
.form-line textarea{width:100%;max-width:520px;min-height:80px;font-size:13px}
input[type=checkbox]{vertical-align:-2px}
@media(max-width:900px){
  .ops-side{position:static;width:100%;flex:0 0 auto}
  .ops-shell{display:block}
  .ops-main{margin-left:0}
  .ops-nav{display:flex;flex-wrap:wrap}
  .ops-nav a{border-left:none;border-bottom:3px solid transparent;padding:8px 12px}
  .ops-nav a.active{border-left:none;border-bottom-color:#7485e3}
  .ops-nav .sep,.ops-nav .muted{display:none}
  .grid{grid-template-columns:repeat(2,1fr)}
  .meta{grid-template-columns:repeat(2,1fr)}
}
`;

function fmtTime(ts: number): string {
  if (!ts) return '-';
  const d = new Date((ts + 8 * 3600) * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

const NAV = [
  { href: '/ops', label: '概览', key: 'home' },
  { href: '/ops/sites', label: '博客', key: 'sites' },
  { href: '/ops/content', label: '内容', key: 'content' },
  { href: '/ops/domains', label: '域名', key: 'domains' },
  { href: '/ops/settings', label: '设置', key: 'settings' },
];

export function opsShell(env: Env, opts: { title: string; sub?: string; active: string; body: string; acts?: string }): string {
  const name = platformName(env);
  const base = baseDomain(env);
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(opts.title)} · ${escapeHtml(name)} 运维</title>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="shortcut icon" href="/lib/style/logo.svg"/>
<style>${OPS_CSS}</style>
</head>
<body>
<div class="ops-shell">
  <aside class="ops-side">
    <div class="ops-logo"><img src="/lib/style/logo.svg" alt=""/><div>${escapeHtml(name)}<small>运维面板</small></div></div>
    <nav class="ops-nav">
      ${NAV.map((n) => `<a href="${n.href}" class="${n.key === opts.active ? 'active' : ''}">${n.label}</a>`).join('')}
      <div class="sep"></div>
      <a href="https://${escapeHtml(base)}" target="_blank" rel="noopener">打开平台 ↗</a>
      <a href="/ops/logout">退出登录</a>
      <div class="sep"></div>
      <div class="muted">${escapeHtml(base)}</div>
    </nav>
  </aside>
  <main class="ops-main">
    <div class="ops-top">
      <div><h1>${escapeHtml(opts.title)}</h1>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>
      <div class="acts">${opts.acts || ''}</div>
    </div>
    ${opts.body}
  </main>
</div>
</body>
</html>`;
}

export function opsLoginPage(env: Env, configured: boolean, error = ''): string {
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head><meta charset="UTF-8"/><title>运维登录 · ${escapeHtml(platformName(env))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="stylesheet" href="/lib/style/fk.css"/><style>${OPS_CSS}</style></head>
<body>
<div class="ops-login-wrap">
  <form class="ops-login" method="post" action="/ops/login">
    <h2>${escapeHtml(platformName(env))} 运维</h2>
    <p>请输入运维密码</p>
    ${!configured ? '<div class="notice" style="margin-bottom:12px">未配置 OPS_PASSWORD，请先执行 <span class="mono">npx wrangler secret put OPS_PASSWORD</span></div>' : ''}
    ${error ? `<div class="notice red" style="margin-bottom:12px">${escapeHtml(error)}</div>` : ''}
    <input type="password" name="password" placeholder="密码" autocomplete="current-password" ${!configured ? 'disabled' : ''}/>
    <button class="ops-btn primary" type="submit" ${!configured ? 'disabled' : ''}>进入</button>
  </form>
</div>
</body></html>`;
}

export function opsOverviewPage(
  env: Env,
  d: {
    totals: any;
    trend: { day: string; n: number }[];
    top: any[];
    recentSites: any[];
    recentComments: any[];
    cfg: { registration: number; announcement: string; ipLimit: number };
    notice?: string;
    quota?: QuotaInfo;
  }
): string {
  const base = baseDomain(env);
  const max = Math.max(1, ...d.trend.map((t) => t.n));
  const bars = d.trend
    .map((t) => `<div class="bar"><i style="height:${Math.round((t.n / max) * 88)}%"></i><span>${t.day.slice(5)}</span></div>`)
    .join('');
  const totalWeek = d.trend.reduce((a, b) => a + b.n, 0);

  const q = d.quota;
  const qcolor = !q || !q.available ? '#8a90a0' : q.percent >= 90 ? '#d9534f' : q.percent >= 70 ? '#e39b3c' : '#5b6fd6';
  const quotaCard = `<div class="ops-card">
    <div class="ops-card-h"><span>今日 Worker 额度</span><span class="num">UTC 0 点重置</span></div>
    <div class="ops-card-b">
      ${
        q && q.available
          ? `<div class="qrow"><span>已用</span><b>${q.used.toLocaleString('en-US')} / 100,000</b></div>
             <div class="qbar"><i style="width:${Math.max(2, q.percent)}%;background:${qcolor}"></i></div>
             <div class="qrow"><span>剩余</span><b style="color:${qcolor}">${q.remaining.toLocaleString('en-US')}</b></div>
             <div class="num" style="margin-top:8px;font-size:12px">全平台共用 · 数据延迟约 1–2 分钟</div>`
          : `<div class="num" style="line-height:20px">额度统计未接入。执行 <span class="mono">npx wrangler secret put CF_ANALYTICS_TOKEN</span> 并填入只读 Analytics Token 后生效。<br/>免费额度 10 万请求/天。</div>`
      }
    </div>
  </div>`;

  const body = `
<div class="grid">
  <div class="kpi"><b>${d.totals.sites}</b><span>博客总数</span></div>
  <div class="kpi"><b>${d.totals.active}</b><span>正常</span></div>
  <div class="kpi"><b>${d.totals.disabled}</b><span>已停用</span></div>
  <div class="kpi"><b>${d.totals.articles}</b><span>文章</span></div>
  <div class="kpi"><b>${d.totals.comments}</b><span>评论</span></div>
  <div class="kpi"><b>${d.totals.views}</b><span>总浏览</span></div>
</div>
<div class="dash">
  <div class="col">
    <div class="ops-card">
      <div class="ops-card-h"><span>近 7 天注册</span><span class="muted">本周 ${totalWeek} 个</span></div>
      <div class="ops-card-b"><div class="bars">${bars}</div></div>
    </div>
    <div class="ops-card">
      <div class="ops-card-h"><span>最新博客</span><a class="ops-btn sm" href="/ops/sites">全部</a></div>
      <table class="t">
        <thead><tr><th>子域</th><th>名称</th><th>文章</th><th>注册时间</th><th>状态</th></tr></thead>
        <tbody>
          ${
            d.recentSites.length
              ? d.recentSites
                  .map(
                    (s) => `<tr><td><a class="mono" href="/ops/site/${encodeURIComponent(s.id)}">${escapeHtml(s.id)}</a></td><td class="ell">${escapeHtml(s.title)}</td><td>${s.articles ?? 0}</td><td class="num">${fmtTime(s.created)}</td><td><span class="badge${s.status ? '' : ' off'}">${s.status ? '正常' : '停用'}</span></td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="5" style="text-align:center;color:#8a90a0;padding:24px">还没有博客</td></tr>'
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="col">
    ${quotaCard}
    <div class="ops-card">
      <div class="ops-card-h"><span>运行状态</span></div>
      <div class="ops-card-b">
        <div class="meta" style="grid-template-columns:repeat(2,1fr)">
          <div><span>今日新增</span><b>${d.totals.today}</b></div>
          <div><span>24h 错误</span><b>${d.totals.errors24h}</b></div>
          <div><span>上传文件</span><b>${d.totals.files}</b></div>
          <div><span>占用空间</span><b>${fmtBytes(d.totals.bytes)}</b></div>
        </div>
        <div class="notice ${d.cfg.registration ? 'blue' : 'red'}" style="margin-top:12px">
          ${d.cfg.registration ? '注册开放中' : '注册已关闭'}　·　同 IP 每日上限 ${d.cfg.ipLimit} 个
          ${d.cfg.announcement ? `<div style="margin-top:6px">公告：${escapeHtml(d.cfg.announcement)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="ops-card">
      <div class="ops-card-h"><span>访问量 Top</span><a class="ops-btn sm" href="/ops/sites?sort=views">排序</a></div>
      <table class="t">
        <thead><tr><th>博客</th><th>文章</th><th>浏览</th></tr></thead>
        <tbody>
          ${
            d.top.length
              ? d.top
                  .map(
                    (s) => `<tr><td><a class="mono" href="https://${escapeHtml(s.id)}.${escapeHtml(base)}" target="_blank" rel="noopener">${escapeHtml(s.id)}</a></td><td>${s.articles}</td><td>${s.views}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="3" style="text-align:center;color:#8a90a0;padding:24px">没有数据</td></tr>'
          }
        </tbody>
      </table>
    </div>
    <div class="ops-card">
      <div class="ops-card-h"><span>最新评论</span><a class="ops-btn sm" href="/ops/content">全部</a></div>
      <table class="t">
        <tbody>
          ${
            d.recentComments.length
              ? d.recentComments
                  .map(
                    (c) => `<tr>
                <td style="width:96px" class="mono"><a href="/ops/site/${encodeURIComponent(c.site)}">${escapeHtml(c.site)}</a></td>
                <td class="ell" title="${escapeHtml(c.content)}">${escapeHtml(c.content)}</td>
                <td class="num" style="width:78px">${fmtTime(c.time).slice(5)}</td>
                <td style="width:40px"><form method="post" action="/ops/comment/delete" onsubmit="return confirm('删除这条评论？')"><input type="hidden" name="site" value="${escapeHtml(c.site)}"/><input type="hidden" name="aid" value="${escapeHtml(c.aid)}"/><input type="hidden" name="id" value="${c.id}"/><button class="ops-btn sm danger" type="submit">删</button></form></td>
              </tr>`
                  )
                  .join('')
              : '<tr><td style="text-align:center;color:#8a90a0;padding:24px">还没有评论</td></tr>'
          }
        </tbody>
      </table>
    </div>
  </div>
</div>`;
  return opsShell(env, { title: '概览', sub: `共 ${d.totals.sites} 个博客 · ${d.totals.articles} 篇文章 · ${d.totals.comments} 条评论`, active: 'home', body, acts: '<a class="ops-btn" href="/" target="_blank">前台</a><a class="ops-btn primary" href="/ops/sites">管理博客</a>' });
}

export function opsSitesPage(env: Env, d: { rows: any[]; total: number; page: number; pages: number; q: string; status: string; sort: string }): string {
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ q: d.q, status: d.status, sort: d.sort, page: String(d.page) });
    for (const [k, v] of Object.entries(over)) p.set(k, v);
    return '/ops/sites?' + p.toString();
  };
  const rows = d.rows
    .map(
      (s) => `<tr>
      <td><input type="checkbox" name="id" value="${escapeHtml(s.id)}"/></td>
      <td><a class="mono" href="/ops/site/${encodeURIComponent(s.id)}">${escapeHtml(s.id)}</a>${s.domain ? `<div class="num">${escapeHtml(s.domain)}</div>` : ''}</td>
      <td class="ell" style="max-width:220px">${escapeHtml(s.title || '')}</td>
      <td>${s.articles}</td>
      <td>${s.comments}</td>
      <td>${s.views}</td>
      <td><span class="badge${s.status ? '' : ' off'}">${s.status ? '正常' : '停用'}</span></td>
      <td class="num">${fmtTime(s.created)}</td>
      <td class="num">${escapeHtml(s.ip || '')}</td>
      <td style="white-space:nowrap">
        <a class="ops-btn sm" href="https://${escapeHtml(s.id)}.${escapeHtml(baseDomain(env))}" target="_blank" rel="noopener">访问</a>
        <a class="ops-btn sm" href="/ops/enter?site=${encodeURIComponent(s.id)}">后台</a>
      </td>
    </tr>`
    )
    .join('');

  const body = `
<div class="ops-card">
  <form method="get" action="/ops/sites">
    <div class="ops-toolbar">
      <input type="text" name="q" value="${escapeHtml(d.q)}" placeholder="搜子域 / 名称 / 域名"/>
      <select name="status">
        <option value=""${d.status === '' ? ' selected' : ''}>全部状态</option>
        <option value="active"${d.status === 'active' ? ' selected' : ''}>正常</option>
        <option value="disabled"${d.status === 'disabled' ? ' selected' : ''}>已停用</option>
        <option value="domain"${d.status === 'domain' ? ' selected' : ''}>绑了域名</option>
      </select>
      <select name="sort">
        <option value="new"${d.sort === 'new' ? ' selected' : ''}>最新注册</option>
        <option value="old"${d.sort === 'old' ? ' selected' : ''}>最早注册</option>
        <option value="views"${d.sort === 'views' ? ' selected' : ''}>浏览最多</option>
        <option value="articles"${d.sort === 'articles' ? ' selected' : ''}>文章最多</option>
      </select>
      <button class="ops-btn primary" type="submit">筛选</button>
      <span class="spacer"></span>
    </div>
  </form>
  <form method="post" action="/ops/action">
    <div class="ops-toolbar">
      <button class="ops-btn sm" type="submit" name="action" value="enable">批量启用</button>
      <button class="ops-btn sm" type="submit" name="action" value="disable">批量停用</button>
      <button class="ops-btn sm danger" type="submit" name="action" value="delete" onclick="return confirm('删除选中的博客？所有文章、评论、上传文件和主题都会清空，不可恢复。')">批量删除</button>
      <span class="num">勾选左侧复选框后操作</span>
      <span class="spacer"></span>
      <label class="num"><input type="checkbox" onclick="document.querySelectorAll('input[name=id]').forEach(c=>c.checked=this.checked)"/> 全选</label>
    </div>
    <div style="overflow-x:auto">
      <table class="t">
        <thead><tr><th style="width:34px"></th><th>子域</th><th>名称</th><th>文章</th><th>评论</th><th>浏览</th><th>状态</th><th>注册</th><th>IP</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" style="text-align:center;color:#8a90a0;padding:30px">没有匹配的博客</td></tr>'}</tbody>
      </table>
    </div>
  </form>
  ${opsPagingInline(qs, d.page, d.pages)}
</div>`;
  return opsShell(env, { title: '博客', sub: `共 ${d.total} 个`, active: 'sites', body });
}

function opsPagingInline(qs: (o: Record<string, string>) => string, page: number, pages: number): string {
  if (pages <= 1) return '';
  const items: string[] = [];
  const add = (p: number, label: string, active = false) =>
    items.push(`<a class="ops-page${active ? ' active' : ''}" href="${qs({ page: String(p) })}">${label}</a>`);
  if (page > 1) add(page - 1, '上一页');
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let p = start; p <= end; p++) add(p, String(p), p === page);
  if (page < pages) add(page + 1, '下一页');
  return `<div class="ops-paging">${items.join('')}<span class="num">共 ${pages} 页</span></div>`;
}

export function opsSitePage(
  env: Env,
  d: {
    site: SiteRow;
    articles: any[];
    comments: any[];
    notice?: string;
    error?: string;
  }
): string {
  const base = baseDomain(env);
  const url = `https://${d.site.id}.${base}`;
  const acts = `<a class="ops-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">访问博客</a>
    <a class="ops-btn" href="/ops/enter?site=${encodeURIComponent(d.site.id)}">进入后台</a>
    <form method="post" action="/ops/action" style="display:inline">
      <input type="hidden" name="id" value="${escapeHtml(d.site.id)}"/>
      <button class="ops-btn" type="submit" name="action" value="${d.site.status ? 'disable' : 'enable'}">${d.site.status ? '停用' : '启用'}</button>
    </form>
    <form method="post" action="/ops/action" style="display:inline" onsubmit="return confirm('删除 ${escapeHtml(d.site.id)}？不可恢复。')">
      <input type="hidden" name="id" value="${escapeHtml(d.site.id)}"/>
      <input type="hidden" name="back" value="/ops/sites"/>
      <button class="ops-btn danger" type="submit" name="action" value="delete">删除</button>
    </form>`;

  const articleRows = d.articles
    .map(
      (a) => `<tr>
      <td><a href="${escapeHtml(url)}/${encodeURIComponent(a.id)}" target="_blank" rel="noopener" class="ell" style="display:inline-block;max-width:320px">${escapeHtml(a.title)}</a>${a.isPrivate ? ' <span class="tag">私密</span>' : ''}</td>
      <td>${a.views}</td><td>${a.comments}</td>
      <td class="num">${fmtTime(a.createTime)}</td>
      <td><form method="post" action="/ops/article/delete" onsubmit="return confirm('删除这篇文章？')"><input type="hidden" name="site" value="${escapeHtml(d.site.id)}"/><input type="hidden" name="id" value="${escapeHtml(a.id)}"/><button class="ops-btn sm danger" type="submit">删除</button></form></td>
    </tr>`
    )
    .join('');

  const commentRows = d.comments
    .map(
      (c) => `<tr>
      <td class="num">#${c.id}</td>
      <td>${escapeHtml(c.name || '游客')}</td>
      <td class="ell" style="max-width:360px" title="${escapeHtml(c.content)}">${escapeHtml(c.content)}</td>
      <td class="mono num">${escapeHtml(c.aid)}</td>
      <td class="num">${fmtTime(c.time)}</td>
      <td><form method="post" action="/ops/comment/delete" onsubmit="return confirm('删除这条评论？')"><input type="hidden" name="site" value="${escapeHtml(d.site.id)}"/><input type="hidden" name="aid" value="${escapeHtml(c.aid)}"/><input type="hidden" name="id" value="${c.id}"/><button class="ops-btn sm danger" type="submit">删除</button></form></td>
    </tr>`
    )
    .join('');

  const body = `
${d.notice ? `<div class="notice blue" style="margin-bottom:14px">${escapeHtml(d.notice)}</div>` : ''}
${d.error ? `<div class="notice red" style="margin-bottom:14px">${escapeHtml(d.error)}</div>` : ''}
<div class="ops-card">
  <div class="ops-card-h"><span>${escapeHtml(d.site.title || d.site.id)} <span class="tag">${escapeHtml(d.site.id)}</span></span><span class="badge${d.site.status ? '' : ' off'}">${d.site.status ? '正常' : '已停用'}</span></div>
  <div class="ops-card-b">
    <div class="meta">
      <div><span>地址</span><b class="mono" style="font-size:12px">${escapeHtml(url)}</b></div>
      <div><span>创建</span><b style="font-size:13px">${fmtTime(d.site.created)}</b></div>
      <div><span>注册 IP</span><b style="font-size:13px">${escapeHtml(d.site.ip || '-')}</b></div>
      <div><span>自定义域名</span><b style="font-size:13px">${escapeHtml(d.site.domain || '未绑定')}</b></div>
      <div><span>文章</span><b>${d.articles.length}</b></div>
      <div><span>评论</span><b>${d.comments.length}</b></div>
      <div><span>简介</span><b style="font-size:13px">${escapeHtml(d.site.intro || '-')}</b></div>
      <div><span>最后更新</span><b style="font-size:13px">${fmtTime(d.site.updated)}</b></div>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:18px">
      <form method="post" action="/ops/site/update" style="flex:1;min-width:280px">
        <input type="hidden" name="id" value="${escapeHtml(d.site.id)}"/>
        <div class="form-line"><label>博客名称</label><input type="text" name="title" value="${escapeHtml(d.site.title)}"/></div>
        <div class="form-line"><label>简介</label><input type="text" name="intro" value="${escapeHtml(d.site.intro)}"/></div>
        <div class="form-line"><label></label><button class="ops-btn primary" type="submit">保存资料</button></div>
      </form>
      <form method="post" action="/ops/site/password" style="flex:1;min-width:280px" onsubmit="return confirm('重置这个博客的后台密码？')">
        <input type="hidden" name="id" value="${escapeHtml(d.site.id)}"/>
        <div class="form-line"><label>新密码</label><input type="password" name="password" placeholder="至少 6 位"/></div>
        <div class="form-line"><label></label><button class="ops-btn" type="submit">重置密码</button><span class="num">同时更新控制台登录密码</span></div>
      </form>
    </div>
  </div>
</div>
<div class="ops-card">
  <div class="ops-card-h"><span>文章 <span class="num">${d.articles.length}</span></span></div>
  <div style="overflow-x:auto"><table class="t"><thead><tr><th>标题</th><th>浏览</th><th>评论</th><th>发布</th><th>操作</th></tr></thead><tbody>${articleRows || '<tr><td colspan="5" style="text-align:center;color:#8a90a0;padding:26px">没有文章</td></tr>'}</tbody></table></div>
</div>
<div class="ops-card">
  <div class="ops-card-h"><span>评论 <span class="num">${d.comments.length}</span></span></div>
  <div style="overflow-x:auto"><table class="t"><thead><tr><th>#</th><th>昵称</th><th>内容</th><th>文章</th><th>时间</th><th>操作</th></tr></thead><tbody>${commentRows || '<tr><td colspan="6" style="text-align:center;color:#8a90a0;padding:26px">没有评论</td></tr>'}</tbody></table></div>
</div>`;
  return opsShell(env, { title: d.site.title || d.site.id, sub: `博客详情 · ${d.site.id}`, active: 'sites', body, acts });
}

export function opsContentPage(
  env: Env,
  d: { tab: string; q: string; rows: any[]; total: number; page: number; pages: number }
): string {
  const base = baseDomain(env);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ tab: d.tab, q: d.q, page: String(d.page) });
    for (const [k, v] of Object.entries(over)) p.set(k, v);
    return '/ops/content?' + p.toString();
  };
  const tabs = `<div class="ops-toolbar">
    <a class="ops-btn ${d.tab === 'comments' ? 'primary' : ''}" href="${qs({ tab: 'comments', page: '1' })}">评论</a>
    <a class="ops-btn ${d.tab === 'articles' ? 'primary' : ''}" href="${qs({ tab: 'articles', page: '1' })}">文章</a>
    <span class="spacer"></span>
    <form method="get" action="/ops/content" style="display:flex;gap:8px">
      <input type="hidden" name="tab" value="${escapeHtml(d.tab)}"/>
      <input type="text" name="q" value="${escapeHtml(d.q)}" placeholder="搜内容 / 昵称 / 子域"/>
      <button class="ops-btn primary" type="submit">搜索</button>
    </form>
  </div>`;

  const rows =
    d.tab === 'articles'
      ? d.rows
          .map(
            (a) => `<tr>
        <td><a class="mono" href="/ops/site/${encodeURIComponent(a.site)}">${escapeHtml(a.site)}</a></td>
        <td><a class="ell" style="display:inline-block;max-width:360px" href="https://${escapeHtml(a.site)}.${escapeHtml(base)}/${encodeURIComponent(a.id)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></td>
        <td>${a.views}</td><td>${a.comments}</td><td class="num">${fmtTime(a.createTime)}</td>
        <td><form method="post" action="/ops/article/delete" onsubmit="return confirm('删除这篇文章？')"><input type="hidden" name="site" value="${escapeHtml(a.site)}"/><input type="hidden" name="id" value="${escapeHtml(a.id)}"/><button class="ops-btn sm danger" type="submit">删除</button></form></td>
      </tr>`
          )
          .join('')
      : d.rows
          .map(
            (c) => `<tr>
        <td><a class="mono" href="/ops/site/${encodeURIComponent(c.site)}">${escapeHtml(c.site)}</a></td>
        <td>${escapeHtml(c.name || '游客')}</td>
        <td class="ell" style="max-width:340px" title="${escapeHtml(c.content)}">${escapeHtml(c.content)}</td>
        <td class="num ell" style="max-width:160px">${escapeHtml(c.articleTitle || c.aid)}</td>
        <td class="num">${fmtTime(c.time)}</td>
        <td><form method="post" action="/ops/comment/delete" onsubmit="return confirm('删除这条评论？')"><input type="hidden" name="site" value="${escapeHtml(c.site)}"/><input type="hidden" name="aid" value="${escapeHtml(c.aid)}"/><input type="hidden" name="id" value="${c.id}"/><button class="ops-btn sm danger" type="submit">删除</button></form></td>
      </tr>`
          )
          .join('');

  const head =
    d.tab === 'articles'
      ? '<tr><th>博客</th><th>标题</th><th>浏览</th><th>评论</th><th>发布</th><th>操作</th></tr>'
      : '<tr><th>博客</th><th>昵称</th><th>内容</th><th>文章</th><th>时间</th><th>操作</th></tr>';

  const body = `<div class="ops-card">${tabs}
    <div style="overflow-x:auto"><table class="t"><thead>${head}</thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#8a90a0;padding:30px">没有数据</td></tr>`}</tbody></table></div>
    ${opsPagingInline(qs, d.page, d.pages)}
  </div>`;
  return opsShell(env, { title: '内容', sub: `共 ${d.total} 条`, active: 'content', body });
}

export function opsDomainsPage(env: Env, rows: any[]): string {
  const trs = rows
    .map(
      (r) => `<tr>
      <td class="mono">${escapeHtml(r.host)}</td>
      <td><a class="mono" href="/ops/site/${encodeURIComponent(r.site)}">${escapeHtml(r.site)}</a> <span class="num">${escapeHtml(r.siteTitle || '')}</span></td>
      <td><span class="badge${r.status ? '' : ' gray'}">${r.status ? '已登记' : '待开通'}</span></td>
      <td class="num">${fmtTime(r.created)}</td>
      <td><form method="post" action="/ops/domain/delete" onsubmit="return confirm('解除这个域名绑定？')"><input type="hidden" name="host" value="${escapeHtml(r.host)}"/><button class="ops-btn sm danger" type="submit">解除</button></form></td>
    </tr>`
    )
    .join('');
  const body = `<div class="ops-card">
    <div class="ops-card-h"><span>自定义域名</span><span class="num">${rows.length} 个</span></div>
    <div style="overflow-x:auto"><table class="t">
      <thead><tr><th>域名</th><th>博客</th><th>状态</th><th>登记时间</th><th>操作</th></tr></thead>
      <tbody>${trs || '<tr><td colspan="5" style="text-align:center;color:#8a90a0;padding:30px">还没有登记域名</td></tr>'}</tbody>
    </table></div>
    <div class="ops-card-b"><div class="notice">绑定自己的域名需要 Cloudflare for SaaS：在平台 zone 开启 SaaS，用户把域名 CNAME 到 ${escapeHtml(baseDomain(env))}，再在 CF 创建 custom hostname 签证书。这里只负责记录映射。</div></div>
  </div>`;
  return opsShell(env, { title: '域名', sub: '自定义域名映射', active: 'domains', body });
}

export function opsSettingsPage(env: Env, cfg: { registration: number; announcement: string; ipLimit: number }, notice = ''): string {
  const body = `
${notice ? `<div class="notice blue" style="margin-bottom:14px">${escapeHtml(notice)}</div>` : ''}
<div class="ops-card">
  <div class="ops-card-h"><span>注册与公告</span></div>
  <div class="ops-card-b">
    <form method="post" action="/ops/settings">
      <div class="form-line"><label>开放注册</label><label><input type="checkbox" name="registration" value="1" ${cfg.registration ? 'checked' : ''}/> 允许新用户创建博客</label></div>
      <div class="form-line"><label>IP 日限额</label><input type="number" name="ipLimit" min="1" max="100" value="${cfg.ipLimit}"/><span class="num">同一 IP 每天最多创建几个博客</span></div>
      <div class="form-line"><label>公告</label><textarea name="announcement" placeholder="显示在平台首页和控制台">${escapeHtml(cfg.announcement)}</textarea></div>
      <div class="form-line"><label></label><button class="ops-btn primary" type="submit">保存设置</button></div>
    </form>
  </div>
</div>
<div class="ops-card">
  <div class="ops-card-h"><span>安全</span></div>
  <div class="ops-card-b">
    <p class="num" style="line-height:22px">运维密码保存在 Worker secret <span class="mono">OPS_PASSWORD</span>，不在数据库里，也不能在面板里改。<br/>
    修改：<span class="mono">npx wrangler secret put OPS_PASSWORD</span><br/>
    会话密钥：<span class="mono">npx wrangler secret put SESSION_SECRET</span>（建议 32 位以上随机串）</p>
  </div>
</div>`;
  return opsShell(env, { title: '设置', sub: '平台级开关', active: 'settings', body });
}
