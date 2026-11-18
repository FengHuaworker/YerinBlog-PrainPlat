/** 前台路由：对照原版 index.php 的前台分支 */

import { Ctx } from '../app';
import { Fk } from '../lib/fk';
import { addError, countComments, deleteCommentRow, getArticleById, insertComment, listArticles, listComments, recentCommentByIp, saveConf, setArticleComments, updateArticleRow, incrementArticleViews } from '../lib/db';
import { captchaSvg, makeCaptchaCode } from '../lib/captcha';
import { importSx } from '../lib/pkg';
import { handleUpload } from '../lib/upload';
import { AnyObj, arrPages, arrTree, arrWhere, dates, escapeHtml, humanDate, intval, mbLen, pagesInit, stripTags } from '../lib/util';

const DAY = 86400;

function cookieOf(req: Request, name: string): string | null {
  const c = req.headers.get('Cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function withSetCookie(resp: Response, cookie: string): Response {
  const headers = new Headers(resp.headers);
  headers.append('Set-Cookie', cookie);
  return new Response(resp.body, { status: resp.status, headers });
}

function articleInit(a: any, categoryList: AnyObj): any {
  if (!a) return a;
  const info = { ...a };
  info.url = '/' + info.id;
  info.time = dates(info.createTime);
  if (info.tag && info.tag.length) {
    const list: any[] = [];
    let html = '';
    for (const v of info.tag) {
      const link = `<a href="/tag/${v}">${v}</a>`;
      html += link;
      list.push({ name: v, url: `/tag/${v}`, html: link });
    }
    info.tag = { name: info.tag.join(' '), html, list };
  } else {
    info.tag = { name: '', html: '', list: [] };
  }
  if (categoryList[info.cid]) info.category = categoryList[info.cid];
  else info.category = { id: '', name: '', intro: '', count: 0, url: '' };
  return info;
}

export async function buildBase(ctx: Ctx): Promise<AnyObj> {
  const raw = await listArticles(ctx.env);
  const categoryList: AnyObj = {};
  for (const [k, v] of Object.entries(ctx.conf.category || {})) {
    categoryList[k] = { id: k, name: (v as any).name, intro: (v as any).intro, count: (v as any).count, url: `${ctx.urlBase}category/${k}` };
  }
  const tagList: AnyObj = {};
  for (const [k, v] of Object.entries(ctx.conf.tag || {})) {
    tagList[k] = { id: k, name: k, count: v, url: `${ctx.urlBase}tag/${k}` };
  }
  const articleList: AnyObj = {};
  for (const [id, a] of Object.entries(raw)) articleList[id] = articleInit(a, categoryList);
  return {
    rawList: raw,
    articleList,
    categoryList,
    tagList,
    navbarList: ctx.conf.navbar || [],
    linkList: ctx.conf.link || [],
  };
}

export function selectSet(raw: AnyObj, categoryList: AnyObj, cond: AnyObj, orderby: AnyObj, url: string, page: number, pageSize: number): AnyObj {
  // 先在“原始字段”上过滤（tag 仍是数组），再做 articleInit，保持与原版 arrWhere→articleInit 的顺序一致
  const sel = arrWhere(raw, cond, orderby);
  const tops: AnyObj = {};
  const norms: AnyObj = {};
  for (const [k, v] of Object.entries(sel)) {
    const item = articleInit(v, categoryList);
    if (item.isTop) tops[k] = item;
    else norms[k] = item;
  }
  const merged = { ...tops, ...norms };
  const count = Object.keys(merged).length;
  return {
    count,
    list: arrPages(merged, page, pageSize),
    paging: pagesInit(url, count, page, pageSize),
  };
}

export async function handleFront(ctx: Ctx, page: string): Promise<Response> {
  const base = await buildBase(ctx);
  const scopeBase: AnyObj = {
    ...base,
    page,
    pageNum: 1,
    pageSize: ctx.conf.article.paging,
    method: ctx.method,
    ajax: ctx.ajax,
    prompt: '',
    url: '',
    id: '',
    searchName: '',
    commentName: ctx.session.data.commentName || '',
    commentContact: ctx.session.data.commentContact || '',
  };

  switch (page) {
    case 'vcode':
      return issueCaptcha(ctx);
    case 'upload':
      if (!ctx.login) return ctx.jump('login');
      return ctx.json(await handleUpload(ctx.env, ctx.post, ctx.files));
    case 'import':
      return handleImport(ctx);
    case 'comment':
      return handleComment(ctx, scopeBase);
    case 'login':
      return handleLoginPage(ctx);
    case 'prompt': {
      const prompt = ctx.session.data.prompt;
      if (!prompt) return ctx.jump();
      const html = await ctx.renderTheme('prompt', { ...scopeBase, prompt: prompt.text || '', url: prompt.url || '' });
      ctx.session.set('prompt', null);
      return ctx.html(html);
    }
    case 'index': {
      const pageNum = Math.max(1, intval(ctx.get(1, '1')) || 1);
      const pageSize = Number(ctx.conf.article.paging) || 30;
      const cond = ctx.login ? {} : { isPrivate: 0 };
      const article = selectSet(base.rawList, base.categoryList, cond, { createTime: 1 }, `${ctx.urlBase}index/{page}`, pageNum, pageSize);
      const html = await ctx.renderTheme('index', { ...scopeBase, pageNum, pageSize, article });
      return ctx.html(html);
    }
    case 'category': {
      const cid = ctx.get(1);
      if (!cid || !base.categoryList[cid]) return ctx.jump('index');
      const pageNum = Math.max(1, intval(ctx.get(2, '1')) || 1);
      const pageSize = Number(ctx.conf.article.paging) || 30;
      const cond: AnyObj = ctx.login ? { cid } : { cid, isPrivate: 0 };
      const article = selectSet(base.rawList, base.categoryList, cond, { createTime: 1, isTop: 1 }, `${ctx.urlBase}category/${cid}/{page}`, pageNum, pageSize);
      const { loadThemeTemplate } = await import('../lib/store');
      const hasCategoryTpl = !!(await loadThemeTemplate(ctx.env, ctx.conf.tpl, 'category'));
      const html = await ctx.renderTheme(hasCategoryTpl ? 'category' : 'index', { ...scopeBase, pageNum, pageSize, article, category: base.categoryList[cid] });
      return ctx.html(html);
    }
    case 'tag': {
      const tag = decodeURIComponent(ctx.get(1));
      const pageNum = Math.max(1, intval(ctx.get(2, '1')) || 1);
      const pageSize = Number(ctx.conf.article.paging) || 30;
      const cond: AnyObj = { tag: { IN: tag } };
      if (!ctx.login) cond.isPrivate = 0;
      const article = selectSet(base.rawList, base.categoryList, cond, {}, `${ctx.urlBase}tag/${encodeURIComponent(tag)}/{page}`, pageNum, pageSize);
      const html = await ctx.renderTheme('index', { ...scopeBase, pageNum, pageSize, article, tab: tag, tagName: tag });
      return ctx.html(html);
    }
    case 'search': {
      if (ctx.method === 'POST') {
        const name = String(ctx.p('name', ''));
        if (name) return ctx.redirect(`${ctx.urlBase}search${ctx.conf.rewrite ? '?' : '&'}name=${encodeURIComponent(name)}`);
      }
      const searchName = stripTags(decodeURIComponent(ctx.q('name', '')));
      const pageNum = Math.max(1, intval(ctx.get(1, '1')) || 1);
      const pageSize = Number(ctx.conf.article.paging) || 30;
      const cond: AnyObj = { title: { LIKE: searchName } };
      if (!ctx.login) cond.isPrivate = 0;
      const article = selectSet(base.rawList, base.categoryList, cond, { createTime: 1, isTop: 1 }, `${ctx.urlBase}search/{page}&name=${encodeURIComponent(searchName)}`, pageNum, pageSize);
      const html = await ctx.renderTheme('index', { ...scopeBase, pageNum, pageSize, article, searchName });
      return ctx.html(html);
    }
    default: {
      // 文章详情
      const id = page;
      const raw = base.rawList[id];
      if (!raw) return ctx.prompt('没有该数据');
      if (raw.isPrivate && !ctx.login) return ctx.prompt('游客无法访问私密文章，请登录！');
      const article = base.articleList[id];
      article.content = raw.isFk ? new Fk(raw.content).html : raw.content;

      const keys = Object.keys(arrWhere(base.articleList, { isPrivate: 0 }, { createTime: 1, isTop: 1 }));
      const current = keys.indexOf(id);
      const prevId = current > 0 ? keys[current - 1] : null;
      const nextId = current >= 0 && current + 1 < keys.length ? keys[current + 1] : null;
      article.prev = prevId ? base.articleList[prevId] : false;
      article.next = nextId ? base.articleList[nextId] : false;

      ctx.conf.desc = article.intro;
      ctx.conf.title = `${article.title}-${ctx.conf.title}`;

      const pageNum = Math.max(1, intval(ctx.get(1, '1')) || 1);
      const pageSize = Number(ctx.conf.comment.paging) || 30;
      const comment = await buildComments(ctx, id, pageNum, pageSize);

      // 浏览量（每会话每篇一次）
      const viewed = ctx.session.data.views || [];
      if (!viewed.includes(id)) {
        viewed.push(id);
        ctx.session.set('views', viewed.slice(-50));
        await incrementArticleViews(ctx.env, id);
      }

      const html = await ctx.renderTheme('page', { ...scopeBase, id, pageNum, pageSize, article, comment });
      return ctx.html(html);
    }
  }
}

async function issueCaptcha(ctx: Ctx): Promise<Response> {
  const width = Math.max(60, Number(ctx.conf.vcode?.width) || 86);
  const height = Math.max(23, Number(ctx.conf.vcode?.height) || 28);
  const length = Math.max(3, Math.min(6, Number(ctx.conf.vcode?.length) || 4));
  const code = makeCaptchaCode(length);
  let sid = cookieOf(ctx.req, 'prain_cap');
  if (!sid || sid.length < 8) sid = crypto.randomUUID().replace(/-/g, '');
  const now = Math.floor(Date.now() / 1000);
  await ctx.env.DB.prepare('DELETE FROM captcha WHERE site=?1 AND expires < ?2').bind(ctx.site, now).run();
  await ctx.env.DB.prepare('INSERT INTO captcha (site,sid,code,expires) VALUES (?1,?2,?3,?4) ON CONFLICT(site,sid) DO UPDATE SET code=excluded.code,expires=excluded.expires')
    .bind(ctx.site, sid, code, now + 600)
    .run();
  const svg = captchaSvg(code, width, height);
  const resp = new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
  return withSetCookie(resp, `prain_cap=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`);
}

async function verifyCaptcha(ctx: Ctx, input: string): Promise<boolean> {
  const sid = cookieOf(ctx.req, 'prain_cap');
  if (!sid) return false;
  const row = await ctx.env.DB.prepare('SELECT code,expires FROM captcha WHERE site=?1 AND sid=?2').bind(ctx.site, sid).first<{ code: string; expires: number }>();
  if (!row) return false;
  if (row.expires < Math.floor(Date.now() / 1000)) return false;
  await ctx.env.DB.prepare('DELETE FROM captcha WHERE site=?1 AND sid=?2').bind(ctx.site, sid).run();
  return String(input || '').trim().toLowerCase() === String(row.code).trim().toLowerCase();
}

export function getCommentHtml(list: AnyObj[], login: boolean, currentId: string): string {
  if (!list || !list.length) return '';
  let html = '<ul class="comment-list">';
  for (const v of list) {
    const who = v.admin
      ? '作者'
      : v.name
      ? `${escapeHtml(v.name)}${v.contact ? ` (${escapeHtml(v.contact)})` : ''}`
      : `游客 (${escapeHtml(v.ip)})`;
    html += `<li id="comment-${v.id}"><div class="comment-box${v.admin ? ' comment-admin' : ''}"><div class="comment-title"><span class="comment-user id-${v.id}">${who}</span><span class="comment-time">${humanDate(v.time)}</span><span class="comment-reply" onclick="SX.reply(${v.id});">回复</span>${login ? `<a href="/comment/delete/${currentId}/${v.id}" data-pjax="false" onclick="return SX.confirm(this,'确实要删除吗？删除不可恢复！')">删除</a>` : ''}</div><div class="comment-content"><p>${escapeHtml(String(v.content || '')).split('\r\n').join('</p><p>')}</p></div></div>`;
    if (v.child && v.child.length) html += getCommentHtml(v.child, login, currentId);
    html += '</li>';
  }
  html += '</ul>';
  return html;
}

async function buildComments(ctx: Ctx, id: string, pageNum: number, pageSize: number): Promise<AnyObj> {
  const comments = await listComments(ctx.env, id);
  const asAny = comments.map((c) => ({ ...c }));
  const roots = asAny.filter((c) => !c.pid);
  const tree = arrTree(asAny).reverse();
  const list = arrPages(tree, pageNum, pageSize) as AnyObj;
  return {
    count: asAny.length,
    list,
    html: getCommentHtml(Object.values(list || {}) as AnyObj[], ctx.login, id),
    paging: pagesInit(`${ctx.urlBase}${id}/{page}#comment`, roots.length, pageNum, pageSize),
  };
}

async function handleComment(ctx: Ctx, base: AnyObj): Promise<Response> {
  const action = ctx.get(1);
  if (action === 'delete') {
    if (!ctx.login) return ctx.jump('login');
    const articleId = ctx.get(2);
    const commentId = intval(ctx.get(3));
    if (!articleId) return ctx.prompt('文章ID不存在');
    if (!commentId) return ctx.prompt('评论ID不存在');
    await deleteCommentDeep(ctx, articleId, commentId);
    await refreshCommentCount(ctx, articleId);
    return ctx.redirect(`${ctx.urlBase}${articleId}#comment`);
  }
  if (ctx.method !== 'POST') return ctx.jump();

  if (ctx.conf.vcode?.open && !(await verifyCaptcha(ctx, String(ctx.p('vcode', ''))))) {
    return ctx.prompt('验证码不正确');
  }
  const restrict = Number(ctx.conf.comment?.restrict) || 20;
  if (Number(ctx.session.data.commentCount) >= restrict) return ctx.prompt(`每日评论次数不能超过${restrict}次哦！`);

  const articleId = String(ctx.p('page', ''));
  const raw = base.rawList[articleId];
  if (!raw) return ctx.prompt('该文章不存在');
  if (!raw.isComment) return ctx.prompt('该文章未开启评论留言');

  const name = stripTags(String(ctx.p('name', '')).trim());
  const contact = stripTags(String(ctx.p('contact', '')).trim());
  const content = stripTags(String(ctx.p('content', ''))).trim();
  if (mbLen(name) > 20) return ctx.prompt('名字不能超过20个字符');
  if (mbLen(contact) > 20) return ctx.prompt('联系方式不能超过20个字符');
  if (mbLen(content) > 2000) return ctx.prompt('留言字数不能大于2000');

  const sensitive = String(ctx.conf.sensitive || '').split(' ').map((s) => s.trim()).filter(Boolean);
  for (const s of sensitive) {
    if (content.includes(s)) return ctx.prompt(`您的留言包含敏感信息: 【${s}】`);
  }
  ctx.session.set('commentName', name);
  ctx.session.set('commentContact', contact);

  if (!content) return ctx.prompt('留言内容不能为空');

  const todayStart = Math.floor(new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime() / 1000);
  const spam = await recentCommentByIp(ctx.env, articleId, ctx.ip, content, todayStart);
  if (spam > 20) return ctx.prompt('禁止灌水');

  const comments = await listComments(ctx.env, articleId);
  const nextId = comments.length ? Math.max(...comments.map((c) => c.id)) + 1 : 1;
  const pid = intval(ctx.p('pid', 0));
  await insertComment(ctx.env, {
    aid: articleId,
    id: nextId,
    pid,
    admin: ctx.login ? 1 : 0,
    name: name || ctx.ip,
    contact,
    content,
    ip: ctx.ip,
    time: Math.floor(Date.now() / 1000),
  });
  const conf = { ...ctx.conf };
  conf.comment = { ...conf.comment, count: (Number(conf.comment?.count) || 0) + 1 };
  await saveConf(ctx.env, conf);
  ctx.conf = conf;
  ctx.session.set('commentCount', Number(ctx.session.data.commentCount) + 1);
  await refreshCommentCount(ctx, articleId);
  return ctx.redirect(`${ctx.urlBase}${articleId}#comment-${nextId}`);
}

async function deleteCommentDeep(ctx: Ctx, aid: string, id: number): Promise<void> {
  const comments = await listComments(ctx.env, aid);
  const children = comments.filter((c) => c.pid === id);
  for (const child of children) await deleteCommentDeep(ctx, aid, child.id);
  await deleteCommentRow(ctx.env, aid, id);
  const conf = { ...ctx.conf };
  conf.comment = { ...conf.comment, count: Math.max(0, (Number(conf.comment?.count) || 1) - 1) };
  await saveConf(ctx.env, conf);
  ctx.conf = conf;
}

async function refreshCommentCount(ctx: Ctx, aid: string): Promise<void> {
  const n = await countComments(ctx.env, aid);
  await setArticleComments(ctx.env, aid, n);
}

async function handleLoginPage(ctx: Ctx): Promise<Response> {
  const { loadThemeTemplate } = await import('../lib/store');
  const has = await loadThemeTemplate(ctx.env, ctx.conf.tpl, 'login');
  if (has) return ctx.html(await ctx.renderTheme('login', {}));
  return ctx.jump('admin/login');
}

async function handleImport(ctx: Ctx): Promise<Response> {
  if (!ctx.login) return ctx.jump('login');
  const file = ctx.files['file'];
  if (!file) return ctx.json({ error: true, message: '导入失败：未收到文件' });
  const name = file.name || '';
  if (!/\.sx$/i.test(name)) return ctx.json({ error: true, message: '导入失败：仅支持 .sx 应用包' });
  const text = await file.text();
  const type = ctx.get(1, 'system') || 'system';
  const outcome = await importSx(ctx.env, text, type);
  if (!outcome.ok) return ctx.json({ error: true, message: outcome.message });
  return ctx.json({ error: false, message: outcome.message + (outcome.warnings ? `（${outcome.warnings} 处 PHP 代码未转换）` : ''), data: outcome });
}
