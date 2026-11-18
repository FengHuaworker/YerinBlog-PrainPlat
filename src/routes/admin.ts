/** 后台路由：对照原版 index.php 的 admin 分支 */

import { Ctx } from '../app';
import { Fk } from '../lib/fk';
import {
  clearErrors,
  confSet,
  deleteArticleRow,
  deletePkg,
  getPkg,
  insertArticle,
  listArticles,
  listErrors,
  saveConf,
  savePkg,
  updateArticleRow,
} from '../lib/db';
import { md5 } from '../lib/md5';
import { verifyToken } from '../lib/session';
import { exportSx, extList, importSx, removePkg, themeList } from '../lib/pkg';
import { BUILTIN_THEME, loadAdminTemplate, loadThemeTemplate } from '../lib/store';
import { AnyObj, arrPages, arrWhere, dates, intval, mbLen, mbSubstr, pagesInit, stripTags } from '../lib/util';
import { buildBase, selectSet } from './front';

function ok(ctx: Ctx, message: string, data: any = ''): Promise<Response> {
  return ctx.json({ error: false, message, data });
}
function fail(ctx: Ctx, message: string, data: any = ''): Promise<Response> {
  return ctx.json({ error: true, message, data });
}

function arrays(post: AnyObj, key: string): string[] {
  const v = post[key];
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null) return [];
  return [String(v)];
}

export async function handleAdmin(ctx: Ctx, adminPage: string): Promise<Response> {
  const page = 'admin';
  if (!ctx.login && adminPage !== 'login' && adminPage !== 'prompt' && adminPage !== 'install') {
    return ctx.jump('login');
  }
  const base = await buildBase(ctx);

  const scope = async (extra: AnyObj = {}): Promise<AnyObj> => ({
    ...base,
    ...extra,
    page,
    adminPage,
    tpl: await themeList(ctx.env, ctx.conf.tpl),
    ext: await extList(ctx.env, ctx.conf.ext || {}),
    settingPage: extra.settingPage || {},
  });

  switch (adminPage) {
    case 'login': {
      ctx.conf.title = `${ctx.conf.title}-登录`;
      // 平台控制台签发的单点登录票据（5 分钟有效）
      if (ctx.method === 'GET' && ctx.q('ticket')) {
        const data = await verifyToken(ctx.env, ctx.q('ticket'));
        if (data && data.scope === 'admin' && data.site === ctx.site) {
          ctx.session.set('login', true);
          ctx.session.set('token', (await import('../lib/session')).getToken(ctx.req, ctx.ip));
          ctx.login = true;
          return ctx.jump('admin/index');
        }
        return ctx.prompt('登录票据已过期，请回控制台重新进入', false, true);
      }
      if (ctx.method === 'POST') {
        if (Number(ctx.session.data.loginCount) > 9 && Math.floor(Date.now() / 1000) - Number(ctx.session.data.loginTime) < 1800) {
          return ctx.prompt('密码错误次数太多啦，请君好好想想，半小时后再登录吧！', false, true);
        }
        const password = String(ctx.p('password', ''));
        const vcode = String(ctx.p('vcode', ''));
        if (!password) return ctx.prompt('密码不能为空', false, true);
        if (ctx.conf.vcode?.open) {
          if (!vcode) return ctx.prompt('验证码不能为空', false, true);
          const sid = ctx.req.headers.get('Cookie')?.match(/prain_cap=([^;]+)/)?.[1];
          if (!sid) return ctx.prompt('验证码错误', false, true);
          const row = await ctx.env.DB.prepare('SELECT code,expires FROM captcha WHERE site=?1 AND sid=?2').bind(ctx.site, sid).first<{ code: string; expires: number }>();
          if (!row || row.expires < Math.floor(Date.now() / 1000) || row.code.toLowerCase() !== vcode.trim().toLowerCase()) {
            return ctx.prompt('验证码错误', false, true);
          }
          await ctx.env.DB.prepare('DELETE FROM captcha WHERE site=?1 AND sid=?2').bind(ctx.site, sid).run();
        }
        if (md5(password) === String(ctx.conf.password || '')) {
          ctx.session.set('login', true);
          ctx.session.set('token', (await import('../lib/session')).getToken(ctx.req, ctx.ip));
          ctx.login = true;
          return ctx.jump('admin/index');
        }
        ctx.session.set('loginCount', Number(ctx.session.data.loginCount) + 1);
        ctx.session.set('loginTime', Math.floor(Date.now() / 1000));
        return ctx.prompt('密码错误', false, true);
      }
      return ctx.html(await ctx.renderAdmin('login', await scope()));
    }
    case 'logout':
      ctx.session.destroy();
      return ctx.jump();

    case 'prompt': {
      const prompt = ctx.session.data.prompt;
      if (!prompt) return ctx.jump('admin');
      const html = await ctx.renderAdmin('prompt', { ...(await scope()), prompt: prompt.text || '', url: prompt.url || '' });
      ctx.session.set('prompt', null);
      return ctx.html(html);
    }

    case 'index': {
      const sess = ctx.session.data;
      ctx.session.set('updateAlert', sess.updateAlert ? 0 : 1);
      return ctx.html(await ctx.renderAdmin('index', await scope()));
    }

    case 'navbar': {
      if (ctx.method === 'POST') {
        const names = arrays(ctx.post, 'name');
        const urls = arrays(ctx.post, 'url');
        const targets = arrays(ctx.post, 'target');
        const list: AnyObj[] = [];
        if (names.length) {
          names.forEach((name, k) => {
            if (!name) throw new Error('名称不能为空');
            if (!urls[k]) throw new Error('链接不能为空');
            list.push({ name, url: urls[k], target: targets.map(String).includes(String(k)) ? 1 : 0, child: [] });
          });
        }
        ctx.conf.navbar = list;
        await saveConf(ctx.env, ctx.conf);
        return ok(ctx, '保存成功');
      }
      return ctx.html(await ctx.renderAdmin('navbar', await scope()));
    }

    case 'category': {
      if (ctx.method === 'POST') {
        const ids = arrays(ctx.post, 'id');
        const newIds = arrays(ctx.post, 'newId');
        const names = arrays(ctx.post, 'name');
        const intros = arrays(ctx.post, 'intro');
        const delIds = arrays(ctx.post, 'delId');
        const post: AnyObj = {};
        const modify: Record<string, string> = {};
        if (newIds.length) {
          newIds.forEach((nid, k) => {
            if (!names[k]) throw new Error('名称不能为空');
            if (!nid) throw new Error('别称不能为空');
            if (ids[k] && nid !== ids[k]) modify[ids[k]] = nid;
            post[nid] = { id: nid, name: names[k], intro: intros[k] || '', count: 0 };
          });
        }
        const raw = await listArticles(ctx.env);
        let changed = false;
        for (const [id, a] of Object.entries(raw)) {
          if (modify[a.cid]) {
            changed = true;
            await ctx.env.DB.prepare('UPDATE article SET cid=?3 WHERE site=?1 AND id=?2').bind(ctx.site, id, modify[a.cid]).run();
          }
          if (delIds.length && delIds.includes(a.cid)) {
            changed = true;
            await ctx.env.DB.prepare("UPDATE article SET cid='' WHERE site=?1 AND id=?2").bind(ctx.site, id).run();
          }
        }
        ctx.conf.category = post;
        await saveConf(ctx.env, ctx.conf);
        await categoryInit(ctx);
        return ok(ctx, '保存成功');
      }
      return ctx.html(await ctx.renderAdmin('category', await scope()));
    }

    case 'link': {
      if (ctx.method === 'POST') {
        const names = arrays(ctx.post, 'name');
        const urls = arrays(ctx.post, 'url');
        const targets = arrays(ctx.post, 'target');
        const list: AnyObj[] = [];
        if (names.length) {
          names.forEach((name, k) => {
            if (!name) throw new Error('名称不能为空');
            if (!urls[k]) throw new Error('链接不能为空');
            list.push({ name, url: urls[k], target: targets.map(String).includes(String(k)) ? 1 : 0 });
          });
        }
        ctx.conf.link = list;
        await saveConf(ctx.env, ctx.conf);
        return ok(ctx, '保存成功');
      }
      return ctx.html(await ctx.renderAdmin('link', await scope()));
    }

    case 'article':
      return handleArticle(ctx, base);

    case 'setting': {
      if (ctx.method === 'POST') {
        const c = { ...ctx.conf };
        c.title = String(ctx.p('title', ''));
        c.name = String(ctx.p('name', ''));
        c.intro = String(ctx.p('intro', ''));
        c.mood = String(ctx.p('mood', ''));
        c.key = String(ctx.p('key', ''));
        c.desc = String(ctx.p('desc', ''));
        c.brief = intval(ctx.p('brief', 0));
        c.avatar = String(ctx.p('avatar', ''));
        c.username = String(ctx.p('username', ''));
        const password = String(ctx.p('password', ''));
        c.password = password.length ? md5(password) : c.password;
        c.compile = !!ctx.p('compile', false);
        c.debug = intval(ctx.p('debug', c.debug));
        c.rewrite = !!ctx.p('rewrite', false);
        c.comment = { ...c.comment };
        c.comment.restrict = intval(ctx.p('commentRestrict', c.comment.restrict));
        c.comment.paging = intval(ctx.p('commentPaging', c.comment.paging));
        c.article = { ...c.article };
        c.article.paging = intval(ctx.p('articlePaging', c.article.paging));
        c.vcode = {
          open: !!ctx.p('vcodeOpen', false),
          width: intval(ctx.p('vcodeWidth', 86)),
          height: intval(ctx.p('vcodeHeight', 28)),
          length: intval(ctx.p('vcodeLength', 4)),
        };
        c.thumb = {
          open: !!ctx.p('thumbOpen', false),
          width: intval(ctx.p('thumbWidth', 300)),
          height: intval(ctx.p('thumbHeight', 300)),
          type: intval(ctx.p('thumbType', 1)),
        };
        c.icp = String(ctx.p('icp', ''));
        c.prn = String(ctx.p('prn', ''));
        c.views = intval(ctx.p('views', 0));
        c.sensitive = String(ctx.p('sensitive', ''));
        c.blacklist = String(ctx.p('blacklist', ''));
        c.js = String(ctx.p('js', ''));
        await saveConf(ctx.env, c);
        ctx.conf = c;
        return ctx.redirect(`${ctx.urlBase}admin/setting`);
      }
      return ctx.html(await ctx.renderAdmin('setting', await scope()));
    }

    case 'compile':
      return ctx.jump('admin/tpl');

    case 'tpl':
      return handleTpl(ctx);

    case 'ext':
      return handleExt(ctx);

    case 'error': {
      if (ctx.get(2) === 'delete') {
        await clearErrors(ctx.env);
        return ctx.jump('admin/error');
      }
      const pageNum = Math.max(1, intval(ctx.get(2, '1')) || 1);
      const pageSize = 30;
      const list = await listErrors(ctx.env);
      const error = {
        count: list.length,
        list: arrPages(list, pageNum, pageSize),
        paging: pagesInit(`${ctx.urlBase}admin/error/{page}`, list.length, pageNum, pageSize),
      };
      return ctx.html(await ctx.renderAdmin('error', { ...(await scope()), error }));
    }

    case 'app': {
      return ctx.html(await ctx.renderAdmin('app', await scope()));
    }

    case 'config': {
      const info = {
        conf: ctx.conf,
        request: {
          url: ctx.url.toString(),
          method: ctx.method,
          ip: ctx.ip,
          colo: ctx.colo,
          userAgent: ctx.req.headers.get('User-Agent'),
        },
        runtime: { platform: 'Cloudflare Workers', version: '1.3.4-worker' },
      };
      return ctx.html(
        `<!DOCTYPE html><html lang="zh-Hans"><head><meta charset="UTF-8"/><title>config</title></head><body style="font-size:13px;display:flex;background:#fff"><pre style="flex:0 0 50%;white-space:pre-wrap;padding:10px;word-break:break-all">${JSON.stringify(info, null, 2)}</pre><pre style="flex:0 0 50%;white-space:pre-wrap;padding:10px;word-break:break-all">${JSON.stringify(Object.fromEntries([...ctx.req.headers].map(([k, v]) => [k, v])), null, 2)}</pre></body></html>`
      );
    }

    case 'phpinfo': {
      const rows = [
        ['运行平台', 'Cloudflare Workers'],
        ['数据中心', ctx.colo],
        ['运行时', 'V8 Isolates'],
        ['数据库', 'Cloudflare D1 (SQLite)'],
        ['文件存储', 'Cloudflare KV'],
        ['PHP 版本', '不适用（Worker 版为 TypeScript 实现）'],
        ['系统版本', 'Prain 1.3.4 (Worker Port)'],
        ['当前 IP', ctx.ip],
      ];
      return ctx.html(
        `<!DOCTYPE html><html lang="zh-Hans"><head><meta charset="UTF-8"/><title>运行环境</title></head><body style="font-family:sans-serif;padding:24px;background:#fff"><h3>运行环境</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px">${rows
          .map(([k, v]) => `<tr><td style="background:#f5f5f5">${k}</td><td>${v}</td></tr>`)
          .join('')}</table></body></html>`
      );
    }

    case 'checkUpdate': {
      try {
        const res = await fetch('https://prain.cn/api/getVersion', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const json: any = await res.json();
        const latest = json?.data;
        return ok(ctx, '操作成功', latest && latest !== '1.3.4' ? latest : false);
      } catch {
        return fail(ctx, '检查更新失败');
      }
    }

    case 'dbUpdate': {
      try {
        const res = await fetch('https://prain.cn/api/getDb', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const list: any = await res.json();
        const version = list?.['#version'];
        if (version) {
          const c = { ...ctx.conf, db: { ...(ctx.conf.db || {}), version } };
          await saveConf(ctx.env, c);
          ctx.conf = c;
          return ok(ctx, '更新成功');
        }
        return fail(ctx, '更新失败');
      } catch {
        return fail(ctx, '更新失败');
      }
    }

    case 'update':
      return fail(ctx, 'Worker 版不支持在线系统同步，请更新 Worker 部署（git pull && npm run deploy）');

    case 'install':
      return ctx.jump('admin');

    default:
      return ctx.prompt('没有该数据', false, true);
  }
}

async function handleArticle(ctx: Ctx, base: AnyObj): Promise<Response> {
  const type = ctx.get(2);
  const pageSize = Number(ctx.conf.article.paging) || 30;

  if (type === 'category' || type === 'tag' || type === 'search' || !type) {
    const pageNum = Math.max(1, intval(ctx.get(type ? 4 : 2, '1')) || 1);
    let cond: AnyObj = {};
    let url = `${ctx.urlBase}admin/article/{page}`;
    if (type === 'category') {
      const cid = decodeURIComponent(ctx.get(3));
      cond = { cid };
      url = `${ctx.urlBase}admin/article/category/${cid}/{page}`;
    } else if (type === 'tag') {
      const tag = decodeURIComponent(ctx.get(3));
      cond = { tag: { IN: tag } };
      url = `${ctx.urlBase}admin/article/tag/${encodeURIComponent(tag)}/{page}`;
    } else if (type === 'search') {
      const name = decodeURIComponent(ctx.get(3));
      cond = { title: { LIKE: name } };
      url = `${ctx.urlBase}admin/article/search/${encodeURIComponent(name)}/{page}`;
    }
    const article = selectSet(base.rawList, base.categoryList, cond, { createTime: 1, isTop: 1 }, url, pageNum, pageSize);
    return ctx.html(await ctx.renderAdmin('article', { ...(await scopeOf(ctx, base)), type: type || '', article }));
  }

  if (type === 'delete') {
    let ids: string[] = arrays(ctx.post, 'id');
    if (!ids.length) {
      const one = ctx.get(3);
      ids = one ? [one] : [];
    }
    if (!ids.length) return fail(ctx, '删除失败');
    let errors = 0;
    const raw = await listArticles(ctx.env);
    for (const id of ids) {
      if (raw[id]) {
        await deleteArticleRow(ctx.env, id);
      } else errors++;
    }
    const left = await listArticles(ctx.env);
    ctx.conf.article = { ...ctx.conf.article, count: Object.keys(left).length };
    await saveConf(ctx.env, ctx.conf);
    await tagInit(ctx);
    await categoryInit(ctx);
    return errors ? fail(ctx, `${errors}篇文章删除失败`) : ok(ctx, '删除成功');
  }

  if (type === 'move') {
    const ids = arrays(ctx.post, 'id');
    const cid = String(ctx.p('cid', ''));
    const com = ctx.get(3);
    if (ids.length && cid) {
      if (com === 'tag') {
        for (const id of ids) await ctx.env.DB.prepare('UPDATE article SET tag=?3 WHERE site=?1 AND id=?2').bind(ctx.site, id, JSON.stringify([cid])).run();
        await tagInit(ctx);
        return ok(ctx, '操作成功');
      }
      if (com === 'category') {
        for (const id of ids) await ctx.env.DB.prepare('UPDATE article SET cid=?3 WHERE site=?1 AND id=?2').bind(ctx.site, id, cid).run();
        await categoryInit(ctx);
        return ok(ctx, '操作成功');
      }
    }
    return fail(ctx, '操作失败');
  }

  if (type === 'create') {
    if (ctx.method === 'POST') {
      const title = stripTags(String(ctx.p('title', '')).trim());
      const content = String(ctx.p('content', '')).trim();
      let id = String(ctx.p('id', '')).trim();
      if (!id) id = 'T' + Math.floor(Date.now() / 1000);
      if (!title) return ctx.prompt('标题不能为空', false, true);
      if (!content) return ctx.prompt('内容不能为空', false, true);
      const exists = await ctx.env.DB.prepare('SELECT 1 FROM article WHERE site=?1 AND id=?2').bind(ctx.site, id).first();
      if (exists) return ctx.prompt('已存在该URL名称', false, true);

      const tagRaw = String(ctx.p('tag', '')).trim();
      const tags = tagRaw ? tagRaw.split(/\s+/).filter(Boolean) : [];
      let intro = String(ctx.p('intro', ''));
      if (!intro) intro = autoIntro(content, Number(ctx.conf.brief) || 40);
      const img = ctx.conf.thumb?.open ? firstImage(content) : '';

      const now = Math.floor(Date.now() / 1000);
      await insertArticle(ctx.env, {
        id,
        cid: String(ctx.p('cid', '')).trim(),
        path: `article/${id}`,
        title,
        intro,
        img,
        tag: tags,
        isTop: intval(ctx.p('isTop', 0)),
        isPrivate: intval(ctx.p('isPrivate', 0)),
        isComment: intval(ctx.p('isComment', 0)),
        isFk: intval(ctx.p('isFk', 0)),
        views: 0,
        comments: 0,
        createTime: now,
        updateTime: now,
        content,
      });
      const all = await listArticles(ctx.env);
      ctx.conf.article = { ...ctx.conf.article, count: Object.keys(all).length };
      await saveConf(ctx.env, ctx.conf);
      await tagInit(ctx);
      await categoryInit(ctx);
      return ctx.jump('admin/article');
    }
    return ctx.html(await ctx.renderAdmin('article.create', await scopeOf(ctx, base)));
  }

  if (type === 'editor') {
    const id = ctx.get(3);
    const raw = await ctx.env.DB.prepare('SELECT * FROM article WHERE site=?1 AND id=?2').bind(ctx.site, id).first<any>();
    if (!raw) return ctx.prompt('没有该数据', false, true);
    let tag: string[] = [];
    try {
      tag = JSON.parse(raw.tag || '[]');
    } catch {}
    const article = {
      ...raw,
      tag: { name: tag.join(' '), html: '', list: [] },
      content: raw.content,
      url: '/' + raw.id,
    };
    if (ctx.method === 'POST') {
      const title = stripTags(String(ctx.p('title', '')).trim());
      const content = String(ctx.p('content', '')).trim();
      if (!title) return ctx.prompt('标题不能为空', false, true);
      if (!content) return ctx.prompt('内容不能为空', false, true);
      let intro = String(ctx.p('intro', ''));
      if (!intro) intro = autoIntro(content, Number(ctx.conf.brief) || 40);
      const img = ctx.conf.thumb?.open ? firstImage(content) : '';
      let newId = String(ctx.p('id', '')).trim();
      if (!newId) newId = 'T' + Math.floor(Date.now() / 1000);
      const tagRaw = String(ctx.p('tag', '')).trim();
      const tags = tagRaw ? tagRaw.split(/\s+/).filter(Boolean) : [];

      if (newId !== id) {
        const dup = await ctx.env.DB.prepare('SELECT 1 FROM article WHERE site=?1 AND id=?2').bind(ctx.site, newId).first();
        if (dup) return ctx.prompt('已存在该URL名称', false, true);
        await deleteArticleRow(ctx.env, id);
      }
      await insertArticle(ctx.env, {
        id: newId,
        cid: String(ctx.p('cid', '')).trim(),
        path: `article/${newId}`,
        title,
        intro,
        img,
        tag: tags,
        isTop: intval(ctx.p('isTop', 0)),
        isPrivate: intval(ctx.p('isPrivate', 0)),
        isComment: intval(ctx.p('isComment', 0)),
        isFk: intval(ctx.p('isFk', 0)),
        views: raw.views || 0,
        comments: raw.comments || 0,
        createTime: raw.createTime || Math.floor(Date.now() / 1000),
        updateTime: Math.floor(Date.now() / 1000),
        content,
      });
      await tagInit(ctx);
      await categoryInit(ctx);
      return ctx.jump('admin/article');
    }
    return ctx.html(await ctx.renderAdmin('article.editor', { ...(await scopeOf(ctx, base)), article }));
  }

  return ctx.jump('admin/article');
}

function autoIntro(content: string, brief: number): string {
  const fk = new Fk(content);
  let html = fk.html.replace(/<[^>]+>/g, '');
  html = html.replace(/[\r\n]+/g, '');
  return mbSubstr(html, 0, brief);
}

function firstImage(content: string): string {
  const m = /<img[^>]+src=['"]([^'"]+\.(?:gif|jpg|jpeg|png|webp))['"]/i.exec(content);
  return m ? m[1] : '';
}

async function scopeOf(ctx: Ctx, base: AnyObj): Promise<AnyObj> {
  return {
    ...base,
    page: 'admin',
    tpl: await themeList(ctx.env, ctx.conf.tpl),
    ext: await extList(ctx.env, ctx.conf.ext || {}),
    settingPage: {},
  };
}

async function tagInit(ctx: Ctx): Promise<void> {
  const raw = await listArticles(ctx.env);
  const counts: AnyObj = {};
  for (const a of Object.values(raw)) {
    for (const t of a.tag || []) counts[t] = (counts[t] || 0) + 1;
  }
  ctx.conf = { ...ctx.conf, tag: counts };
  await saveConf(ctx.env, ctx.conf);
}

async function categoryInit(ctx: Ctx): Promise<void> {
  const raw = await listArticles(ctx.env);
  const c = { ...ctx.conf, category: { ...(ctx.conf.category || {}) } };
  for (const k of Object.keys(c.category)) c.category[k] = { ...c.category[k], count: 0 };
  for (const a of Object.values(raw)) if (c.category[a.cid]) c.category[a.cid].count += 1;
  ctx.conf = c;
  await saveConf(ctx.env, c);
}

async function handleTpl(ctx: Ctx): Promise<Response> {
  const tplPage = ctx.get(2);
  const tplId = ctx.get(3);
  if (tplId) {
    const list = await themeList(ctx.env, ctx.conf.tpl);
    if (!list.list[tplId]) return ctx.jump('admin/tpl');
    if (tplPage === 'install') {
      const c = { ...ctx.conf, tpl: tplId };
      await saveConf(ctx.env, c);
      ctx.conf = c;
      return ctx.jump('admin/tpl');
    }
    if (tplPage === 'delete') {
      if (tplId !== 'default') await removePkg(ctx.env, 'tpl', tplId);
      return ctx.jump('admin/tpl');
    }
    if (tplPage === 'download') {
      const out = await exportSx(ctx.env, 'tpl', tplId);
      if (!out) return fail(ctx, '导出失败');
      return ctx.finish(out.content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename=${out.filename}`,
        },
      });
    }
    if (tplPage === 'setting') {
      const src = await loadThemeTemplate(ctx.env, tplId, 'setting');
      if (src) {
        const { renderSource } = await import('../lib/tpl');
        const html = await renderSource(src, {
          scope: ctx.scope({ ...(await buildBase(ctx)), page: 'admin', adminPage: 'tpl' }),
          constants: ctx.constants(),
          functions: ctx.functions(),
          hooks: ctx.hooks,
          load: async (name, kind) => (kind === 'admin' ? loadAdminTemplate(name) : loadThemeTemplate(ctx.env, tplId, name)),
        });
        return ctx.html(html);
      }
    }
    return ctx.jump('admin/tpl');
  }
  return ctx.html(await ctx.renderAdmin('tpl', await scopeOf(ctx, await buildBase(ctx))));
}

async function handleExt(ctx: Ctx): Promise<Response> {
  const extPage = ctx.get(2);
  const extId = ctx.get(3);
  if (extId) {
    const list = await extList(ctx.env, ctx.conf.ext || {});
    if (!list.list[extId]) {
      // 已导入但未登记的扩展也可安装
      return ctx.jump('admin/ext');
    }
    const c = { ...ctx.conf, ext: { ...(ctx.conf.ext || {}) } };
    if (extPage === 'install') {
      if (!c.ext[extId]) {
        c.ext[extId] = 1;
        await saveConf(ctx.env, c);
        ctx.conf = c;
        if (extId === 'fk-editor') await savePkg(ctx.env, 'ext', extId, { ...(await import('../lib/store')).BUILTIN_EXT_CONF[extId] }, ['fk.css', 'fk.js'], 1);
      }
      return ctx.jump('admin/ext');
    }
    if (extPage === 'uninstall') {
      if (c.ext[extId]) {
        delete c.ext[extId];
        await saveConf(ctx.env, c);
        ctx.conf = c;
      }
      return ctx.jump('admin/ext');
    }
    if (extPage === 'delete') {
      delete c.ext[extId];
      await saveConf(ctx.env, c);
      await removePkg(ctx.env, 'ext', extId);
      ctx.conf = c;
      return ctx.jump('admin/ext');
    }
    if (extPage === 'download') {
      const out = await exportSx(ctx.env, 'ext', extId);
      if (!out) return fail(ctx, '导出失败');
      return ctx.finish(out.content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename=${out.filename}`,
        },
      });
    }
    if (extPage === 'setting') {
      const key = `site:${ctx.site}:ext:${extId}:setting.html`;
      const src = await ctx.env.KV.get(key);
      if (src) {
        const { renderSource } = await import('../lib/tpl');
        const html = await renderSource(src, {
          scope: ctx.scope({ ...(await buildBase(ctx)), page: 'admin', adminPage: 'ext', settingPage: { [extId]: `admin/ext/setting/${extId}` } }),
          constants: ctx.constants(),
          functions: ctx.functions(),
          hooks: ctx.hooks,
          load: async (name, kind) => (kind === 'admin' ? loadAdminTemplate(name) : loadThemeTemplate(ctx.env, ctx.conf.tpl, name)),
        });
        return ctx.html(html);
      }
    }
    return ctx.jump('admin/ext');
  }
  return ctx.html(await ctx.renderAdmin('ext', await scopeOf(ctx, await buildBase(ctx))));
}
