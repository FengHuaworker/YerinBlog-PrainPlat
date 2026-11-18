/** 平台页面：沿用默认主题（Prain）的 HTML 结构与样式 */

import { escapeHtml } from '../lib/util';
import type { SiteRow } from '../lib/platform';
import type { QuotaInfo } from '../lib/quota';

const EXTRA_CSS = `
.hero{padding:38px 34px;background:linear-gradient(120deg,#3E4454 0%,#48526e 55%,#5c6b90 100%);color:#fff;border-radius:4px}
.hero h1{font-size:34px;line-height:44px;color:#fff;letter-spacing:1px;font-weight:700}
.hero p{color:#ccd5ea;font-size:15px;line-height:26px;max-width:640px;margin-top:10px}
.hero .hero-tags{margin-top:18px;display:flex;gap:8px;flex-wrap:wrap}
.hero .hero-tags span{font-size:12px;color:#dfe6f7;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:20px}
.hero .btn{margin-top:22px}
.form-row{display:flex;align-items:center;margin-bottom:14px;gap:10px}
.form-row>label{width:76px;flex:0 0 76px;color:#5b5e70;font-size:14px;text-align:right}
.form-row .field{flex:1;display:flex;align-items:center;min-width:0}
.form-row input[type=text],.form-row input[type=password]{width:100%;height:34px;line-height:34px}
.suffix{background:#f4f5f8;border:1px solid #cccedb;border-left:none;height:34px;line-height:32px;padding:0 10px;color:#7c828f;font-size:13px;white-space:nowrap}
.hint{font-size:12px;color:#9aa0ad;margin-left:8px}
.hint.ok{color:#2e9e5b}.hint.bad{color:#d9534f}
.stat-row{display:flex;gap:10px;padding:0 15px 15px}
.stat{flex:1;background:#f7f8fb;border-radius:4px;padding:14px 10px;text-align:center}
.stat b{display:block;font-size:22px;color:#3E4454;font-weight:700}
.stat span{font-size:12px;color:#8a90a0}
.blog-card{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid #f1f1f1;flex-wrap:wrap}
.blog-card:last-child{border-bottom:none}
.blog-card .blog-title{font-weight:bold;color:#3d434f}
.blog-url{font-family:Consolas,Menlo,monospace;font-size:13px;color:#7485e3}
.muted{color:#8a90a0;font-size:13px}
.notice{background:#fff8e6;border:1px solid #f5e2b3;color:#8a6d3b;padding:10px 12px;border-radius:3px;font-size:13px;line-height:21px}
.notice.blue{background:#f2f5ff;border-color:#dbe2fb;color:#4d5d8a}
.danger{background:#fff5f5;border:1px solid #f3d6d6}
.link-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tag-mini{font-size:12px;color:#7485e3;background:#f2f5ff;padding:2px 8px;border-radius:10px}
.divider{height:1px;background:#f1f1f1;margin:18px 0}
.qbar{height:8px;border-radius:4px;background:#eef0f6;overflow:hidden;margin:8px 0 6px}
.qbar i{display:block;height:100%;border-radius:4px;background:#5b6fd6}
.qrow{display:flex;justify-content:space-between;font-size:12px;color:#8a90a0}
.qrow b{color:#3d434f;font-size:13px}
.qnote{font-size:11px;color:#a0a6b4;margin-top:6px;line-height:16px}
`.trim();

export interface LayoutOpts {
  env: Env;
  title: string;
  body: string;
  site?: string | null;
  ops?: boolean;
}

export function baseDomain(env: Env): string {
  return (env.BASE_DOMAIN || 'example.com').toLowerCase();
}

export function platformName(env: Env): string {
  return env.PLATFORM_NAME || 'YerinBlog';
}

export function layout(opts: LayoutOpts): string {
  const name = platformName(opts.env);
  const login = !!opts.site;
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(opts.title)} · ${escapeHtml(name)}</title>
<meta name="viewport" content="width=device-width,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<meta name="description" content="${escapeHtml(name)}：免费、干净、可绑定域名的 Prain 博客分发平台。"/>
<link rel="shortcut icon" href="/lib/style/logo.svg"/>
<link rel="stylesheet" href="/lib/style/fk.css"/>
<link rel="stylesheet" href="/tpl/default/style/main.css"/>
<style>${EXTRA_CSS}</style>
</head>
<body>
<div class="header">
  <div class="header-title"><img src="/lib/style/logo.svg" alt="logo"/><a href="/">${escapeHtml(name)}</a></div>
  <div class="header-menu">
    <a href="/">首页</a><span class="_drop"></span>
    <a href="/browse">博客目录</a><span class="_drop"></span>
    <a href="/about">平台说明</a>
    <span class="_line"></span>
    ${opts.ops ? '<a href="/ops">运维</a><span class="_drop"></span><a href="/ops/logout">退出</a>' : login ? '<a href="/dashboard">控制台</a><span class="_drop"></span><a href="/logout">退出</a>' : '<a href="/login">登录</a>'}
  </div>
</div>
<div class="main">
${opts.body}
  <div class="footer">
    <div class="footer-left">
      <span>© ${new Date().getFullYear()} <a href="/" class="a-line">${escapeHtml(name)}</a></span>
      <span>基于 <a href="https://prain.cn" target="_blank" rel="noopener">清雨 Prain 1.3.4</a></span>
    </div>
    <div class="footer-right"><span>Cloudflare Workers · 免费额度</span></div>
  </div>
</div>
</body>
</html>`;
}

export function hero(env: Env, loggedIn: boolean): string {
  return `<div class="box hero">
  <h1>写点干净的，<br/>剩下的交给平台。</h1>
  <p>${escapeHtml(platformName(env))} 把清雨博客（Prain）搬到 Cloudflare Workers：注册一个名字，立刻得到 <b>你的名字.${escapeHtml(baseDomain(env))}</b>，带后台、评论、主题和 fk 标记语言。也可以绑定自己的域名。</p>
  <div class="hero-tags"><span>无需服务器</span><span>免费</span><span>自带后台</span><span>支持自定义域名</span><span>数据在 D1</span></div>
  ${loggedIn ? '<a class="btn btn-blue" href="/dashboard">进入控制台</a>' : '<a class="btn btn-blue" href="#create">创建我的博客</a>'}
</div>`;
}

export function registerForm(env: Env): string {
  return `<div class="box" id="create">
  <div class="box-name">创建博客</div>
  <div style="padding:18px 18px 6px">
    <form method="post" action="/register" autocomplete="off">
      <div class="form-row">
        <label>博客地址</label>
        <div class="field"><input type="text" name="name" id="name" placeholder="yourname" maxlength="30"/><span class="suffix">.${escapeHtml(baseDomain(env))}</span></div>
      </div>
      <div class="form-row"><label></label><div class="field"><span class="hint" id="tip">3–30 个字符，只能用 a-z、0-9 和短横线</span></div></div>
      <div class="form-row"><label>博客名称</label><div class="field"><input type="text" name="title" placeholder="我的博客" maxlength="40"/></div></div>
      <div class="form-row"><label>密码</label><div class="field"><input type="password" name="password" placeholder="至少 6 位" maxlength="64"/></div></div>
      <div class="form-row"><label>确认密码</label><div class="field"><input type="password" name="password2" placeholder="再输一次" maxlength="64"/></div></div>
      <div class="form-row"><label></label><div class="field"><label style="width:auto;text-align:left;color:#5b5e70"><input type="checkbox" name="agree" value="1" style="height:auto;vertical-align:-2px"/> 我已知晓：平台运行在免费额度上，访问量大时可能限流</label></div></div>
      <div class="form-row"><label></label><div class="field"><input type="submit" class="btn btn-blue" value="创建博客"/></div></div>
    </form>
  </div>
</div>
<script>
(function(){
  var input=document.getElementById('name'),tip=document.getElementById('tip'),timer=null;
  function set(t,cls){tip.textContent=t;tip.className='hint '+(cls||'');}
  function check(){
    var v=(input.value||'').toLowerCase().trim();
    if(!v){set('3–30 个字符，只能用 a-z、0-9 和短横线');return;}
    fetch('/api/check?name='+encodeURIComponent(v)).then(function(r){return r.json()}).then(function(d){
      if(d.ok){set('√ '+d.name+'.${escapeHtml(baseDomain(env))} 可以使用','ok');}
      else{set('× '+d.reason,'bad');}
    }).catch(function(){set('检查失败，提交时会再校验一次');});
  }
  input.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(check,350);});
})();
</script>`;
}

function siteCard(env: Env, s: SiteRow): string {
  const url = `https://${s.id}.${baseDomain(env)}`;
  return `<div class="blog-card">
  <div>
    <div class="blog-title"><a href="${url}" target="_blank" rel="noopener">${escapeHtml(s.title || s.id)}</a></div>
    <div class="blog-url">${escapeHtml(url)}</div>
  </div>
  <div class="link-row"><a class="tag-mini" href="${url}" target="_blank" rel="noopener">访问</a></div>
</div>`;
}

function quotaBox(q?: QuotaInfo): string {
  if (!q || !q.available) {
    // 对外只展示额度规则，不暴露运维配置信息
    return `<div class="box">
      <div class="box-name">免费额度</div>
      <div style="padding:14px 16px;font-size:12px;line-height:20px;color:#8a90a0">
        全平台共用 <b style="color:#3d434f">10 万请求 / 天</b>，UTC 0 点（北京时间 8 点）重置。<br/>访问量大时可能临时限流。
      </div>
    </div>`;
  }
  const color = q.percent >= 90 ? '#d9534f' : q.percent >= 70 ? '#e39b3c' : '#5b6fd6';
  return `<div class="box">
    <div class="box-name">今日额度</div>
    <div style="padding:14px 16px">
      <div class="qrow"><span>已用</span><b>${q.used.toLocaleString('en-US')} / 10 万</b></div>
      <div class="qbar"><i style="width:${Math.max(2, q.percent)}%;background:${color}"></i></div>
      <div class="qrow"><span>剩余</span><b style="color:${color}">${q.remaining.toLocaleString('en-US')}</b></div>
      <div class="qnote">全平台共用 · UTC 0 点（北京时间 8 点）重置 · 数据延迟约 1–2 分钟</div>
    </div>
  </div>`;
}

export function home(env: Env, site: string | null, total: number, recent: SiteRow[], announcement = '', registration = true, quota?: QuotaInfo): string {
  const body = `
<div class="content">
  <div style="flex:1;min-width:0">
    ${announcement ? `<div class="notice blue" style="margin-bottom:15px">${escapeHtml(announcement)}</div>` : ''}
    ${!registration ? '<div class="notice" style="margin-bottom:15px">注册暂时关闭，仅管理员可以创建博客。</div>' : ''}
    ${hero(env, !!site)}
    <div style="height:15px"></div>
    ${registerForm(env)}
    <div class="box">
      <div class="box-name">最新开通</div>
      ${recent.length ? recent.map((s) => siteCard(env, s)).join('') : '<div class="empty">还没有博客，来当第一个</div>'}
    </div>
  </div>
  <div class="sidebar">
    <div class="box">
      <div class="box-name">平台说明</div>
      <div style="padding:14px 16px;font-size:13px;line-height:22px;color:#5b5e70">
        <p>所有博客共用 Cloudflare Workers 的免费额度，<b>每天约 10 万次请求</b>，由全部站点共享。</p>
        <div class="divider"></div>
        <p>额度用完后，页面可能返回 1027 或暂时打不开，UTC 0 点（北京时间 8 点）恢复。</p>
        <div class="divider"></div>
        <p>不要放盗版、色情、诈骗内容；被举报会直接停用。</p>
        <p style="margin-top:12px"><a href="/about">完整说明 →</a></p>
      </div>
    </div>
    ${quotaBox(quota)}
    <div class="box">
      <div class="box-name">站点数据</div>
      <div class="stat-row" style="padding:15px">
        <div class="stat"><b>${total}</b><span>博客</span></div>
        <div class="stat"><b>10 万</b><span>请求 / 天</span></div>
      </div>
    </div>
  </div>
</div>`;
  return layout({ env, title: '免费 Prain 博客', body, site });
}

export function loginPage(env: Env, site: string | null, error = ''): string {
  const body = `
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      <div class="box-name">登录控制台</div>
      <div style="padding:22px 18px 8px;max-width:520px">
        ${error ? `<div class="notice" style="margin-bottom:14px">${escapeHtml(error)}</div>` : ''}
        <form method="post" action="/login">
          <div class="form-row"><label>博客地址</label><div class="field"><input type="text" name="name" placeholder="yourname"/><span class="suffix">.${escapeHtml(baseDomain(env))}</span></div></div>
          <div class="form-row"><label>密码</label><div class="field"><input type="password" name="password" placeholder="后台密码"/></div></div>
          <div class="form-row"><label></label><div class="field"><input type="submit" class="btn btn-blue" value="登录"/><a href="/" style="margin-left:12px;font-size:13px">还没有博客？创建一个</a></div></div>
        </form>
      </div>
    </div>
  </div>
</div>`;
  return layout({ env, title: '登录', body, site });
}

export function dashboard(env: Env, site: SiteRow, stats: { articles: number; comments: number; views: number }, notice = '', error = ''): string {
  const base = baseDomain(env);
  const url = `https://${site.id}.${base}`;
  const body = `
<div class="headline"><span>我的博客</span><span class="muted">创建于 ${new Date(site.created * 1000).toLocaleDateString('zh-CN')}</span></div>
${notice ? `<div class="notice blue" style="margin-bottom:15px">${escapeHtml(notice)}</div>` : ''}
${error ? `<div class="notice" style="margin-bottom:15px">${escapeHtml(error)}</div>` : ''}
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      <div class="box-name">${escapeHtml(site.title || site.id)}</div>
      <div style="padding:16px 18px">
        <div class="blog-url" style="font-size:14px"><a href="${url}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>
        ${site.domain ? `<div class="muted" style="margin-top:6px">自定义域名：${escapeHtml(site.domain)}</div>` : ''}
        <div class="stat-row" style="padding:16px 0 0">
          <div class="stat"><b>${stats.articles}</b><span>文章</span></div>
          <div class="stat"><b>${stats.comments}</b><span>评论</span></div>
          <div class="stat"><b>${stats.views}</b><span>浏览</span></div>
        </div>
        <div class="link-row" style="margin-top:18px">
          <a class="btn btn-blue" href="${url}" target="_blank" rel="noopener">访问博客</a>
          <a class="btn" href="/enter">进入后台</a>
          <a class="btn" href="/logout">退出登录</a>
        </div>
      </div>
    </div>
    <div class="box">
      <div class="box-name">站点信息</div>
      <div style="padding:18px 18px 6px">
        <form method="post" action="/dashboard/setting">
          <div class="form-row"><label>博客名称</label><div class="field"><input type="text" name="title" value="${escapeHtml(site.title)}" maxlength="40"/></div></div>
          <div class="form-row"><label>显示名</label><div class="field"><input type="text" name="name" value="${escapeHtml(site.name)}" maxlength="40"/></div></div>
          <div class="form-row"><label>简介</label><div class="field"><input type="text" name="intro" value="${escapeHtml(site.intro)}" maxlength="120"/></div></div>
          <div class="form-row"><label>新密码</label><div class="field"><input type="password" name="password" placeholder="留空则不修改"/></div></div>
          <div class="form-row"><label></label><div class="field"><input type="submit" class="btn btn-blue" value="保存"/></div></div>
        </form>
      </div>
    </div>
    <div class="box">
      <div class="box-name">自定义域名</div>
      <div style="padding:18px 18px 6px">
        <div class="notice" style="margin-bottom:14px">绑定自己的域名需要走 Cloudflare for SaaS 签发证书（每个账号 100 个免费），登记后由管理员开通；在此之前请先用平台子域。</div>
        <form method="post" action="/dashboard/domain">
          <div class="form-row"><label>域名</label><div class="field"><input type="text" name="domain" value="${escapeHtml(site.domain)}" placeholder="blog.example.com"/></div></div>
          <div class="form-row"><label></label><div class="field"><input type="submit" class="btn" value="登记域名"/></div></div>
        </form>
      </div>
    </div>
    <div class="box danger">
      <div class="box-name">删除博客</div>
      <div style="padding:18px">
        <p class="muted" style="margin-bottom:12px">会删除文章、评论、上传文件和主题，无法恢复。输入密码确认。</p>
        <form method="post" action="/dashboard/delete" onsubmit="return confirm('确定要删除这个博客吗？删除后无法恢复。');">
          <div class="form-row"><label>密码</label><div class="field"><input type="password" name="password" placeholder="后台密码"/><input type="submit" class="btn" style="margin-left:10px" value="删除"/></div></div>
        </form>
      </div>
    </div>
  </div>
  <div class="sidebar">
    <div class="box">
      <div class="box-name">快速入口</div>
      <ul class="sidebar-tag">
        <li><a href="/enter">进入博客后台</a></li>
        <li><a href="${url}/?admin/setting" target="_blank" rel="noopener">站点设置</a></li>
        <li><a href="${url}/?admin/tpl" target="_blank" rel="noopener">主题</a></li>
        <li><a href="/browse">博客目录</a></li>
        <li><a href="/about">平台说明</a></li>
      </ul>
    </div>
  </div>
</div>`;
  return layout({ env, title: site.title || site.id, body, site: site.id });
}

export function browsePage(env: Env, site: string | null, sites: SiteRow[], total: number): string {
  const body = `
<div class="headline"><span>博客目录</span><span class="muted">共 ${total} 个</span></div>
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      ${sites.length ? sites.map((s) => siteCard(env, s)).join('') : '<div class="empty">还没有博客</div>'}
    </div>
  </div>
  <div class="sidebar">
    <div class="box"><div class="box-name">想要一个？</div><div style="padding:16px"><a class="btn btn-blue" href="/#create">创建博客</a></div></div>
  </div>
</div>`;
  return layout({ env, title: '博客目录', body, site });
}

export function aboutPage(env: Env, site: string | null, total: number): string {
  const base = baseDomain(env);
  const body = `
<div class="headline"><span>平台说明</span><span class="muted">${escapeHtml(platformName(env))}</span></div>
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      <div class="box-name">这是什么</div>
      <div style="padding:16px 18px;line-height:24px;font-size:14px;color:#4c525f">
        <p>${escapeHtml(platformName(env))} 是一个 Prain 博客的分发平台：注册一个子域，就得到一套完整的清雨博客（前台 + 后台 + 评论 + 主题 + fk 标记语言），不需要服务器，也不需要数据库。</p>
        <p style="margin-top:10px">博客地址：<span class="blog-url">&lt;名字&gt;.${escapeHtml(base)}</span>　平台：<span class="blog-url">${escapeHtml(base)}</span></p>
      </div>
    </div>
    <div class="box">
      <div class="box-name">免费额度</div>
      <div style="padding:16px 18px;line-height:24px;font-size:14px;color:#4c525f">
        <p>平台跑在 Cloudflare Workers 免费计划上，全平台共享 <b>每天约 10 万次请求</b>、<b>每天 1000 次 KV 写入</b>。</p>
        <p style="margin-top:10px">这意味着：</p>
        <ul style="padding-left:20px">
          <li>访问量大的博客会挤占其他博客的额度；</li>
          <li>额度耗尽时，页面可能返回 1027，UTC 0 点（北京时间早上 8 点）自动恢复；</li>
          <li>后台上传图片会消耗 KV 写入，建议图片走外链。</li>
        </ul>
        <p style="margin-top:10px">平台会尽量做缓存和静态化来减少请求，但不承诺可用性。</p>
      </div>
    </div>
    <div class="box">
      <div class="box-name">规则</div>
      <div style="padding:16px 18px;line-height:24px;font-size:14px;color:#4c525f">
        <ul style="padding-left:20px">
          <li>子域 3–30 个字符，只能用小写字母、数字和短横线；</li>
          <li><span class="blog-url">admin</span>、<span class="blog-url">api</span>、<span class="blog-url">my</span>、<span class="blog-url">dashboard</span> 等易混淆名字保留给平台，访问时 302 回首页；</li>
          <li>禁止色情、赌博、诈骗、盗版、钓鱼等内容，发现即停用；</li>
          <li>长期无人维护或滥用资源的博客可能被清理；</li>
          <li>请自行备份重要内容（后台可导出文章，主题可导出 .sx）。</li>
        </ul>
      </div>
    </div>
    <div class="box">
      <div class="box-name">自定义域名</div>
      <div style="padding:16px 18px;line-height:24px;font-size:14px;color:#4c525f">
        <p>控制台可以登记自己的域名。真正生效需要在 Cloudflare 上为该域名建 custom hostname 并签发证书（Cloudflare for SaaS，100 个免费），目前由管理员人工开通。</p>
        <p style="margin-top:10px">当前博客数：<b>${total}</b></p>
      </div>
    </div>
  </div>
  <div class="sidebar">
    <div class="box"><div class="box-name">开始</div><div style="padding:16px"><a class="btn btn-blue" href="/#create">创建博客</a></div></div>
  </div>
</div>`;
  return layout({ env, title: '平台说明', body, site });
}

export function promptPage(env: Env, site: string | null, text: string, url: string): string {
  const body = `
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      <div class="box-name">提示</div>
      <div style="padding:30px 24px;text-align:center">
        <p style="font-size:15px;color:#4c525f;line-height:26px">${escapeHtml(text)}</p>
        <a class="btn btn-blue" style="margin-top:16px" href="${escapeHtml(url || '/')}">${url ? '继续' : '返回首页'}</a>
      </div>
    </div>
  </div>
</div>`;
  return layout({ env, title: '提示', body, site });
}

export function notFoundPage(env: Env, site: string | null, text = '没有找到这个博客'): string {
  const root = `https://${baseDomain(env)}`;
  const body = `
<div class="content">
  <div style="flex:1;min-width:0">
    <div class="box">
      <div class="box-name">404</div>
      <div style="padding:40px 24px;text-align:center">
        <p style="font-size:17px;color:#3d434f">${escapeHtml(text)}</p>
        <p class="muted" style="margin-top:10px">地址可能写错了，或者这个博客还没创建。</p>
        <div class="link-row" style="justify-content:center;margin-top:18px">
          <a class="btn btn-blue" href="${root}/#create">创建一个</a>
          <a class="btn" href="${root}/browse">看看别人的</a>
        </div>
      </div>
    </div>
  </div>
</div>`;
  return layout({ env, title: '404', body, site });
}
