/** 数据层：D1 存储，语义对齐原版 db/*.php；所有表按 site（博客子域）隔离 */

import { AnyObj } from './util';

export const DB_VERSION = '1.1.6';
export const PRAIN_VERSION = '1.3.4';

/** 当前请求所属站点（平台为 main，租户为子域标识） */
export function siteOf(env: Env): string {
  return (env as any).SITE || 'main';
}

export const DEFAULT_CONF: AnyObj = {
  title: '',
  name: '',
  intro: '',
  mood: '夜露黏寒，层云弄影，烛映帘栊月半弯',
  key: '',
  desc: '',
  brief: 40,
  avatar: '/lib/style/logo.svg',
  username: '清雨',
  password: '',
  tpl: 'default',
  compile: true,
  debug: 2,
  rewrite: true,
  article: { paging: 30, count: 2 },
  comment: { restrict: 20, paging: 30, count: 0 },
  thumb: { open: true, width: 300, height: 300, type: 1 },
  vcode: { open: true, width: 86, height: 28, length: 4 },
  icp: '',
  prn: '',
  views: 0,
  blacklist: '',
  tag: { 默认: 2 },
  ext: { app: 1, 'fk-editor': 1 },
  category: {
    default: { id: 'default', name: '默认', intro: '默认分类', count: 2 },
  },
  navbar: [
    { name: '首页', url: '/', target: 0, child: [] },
    { name: '留言', url: '/?message', target: 0, child: [] },
  ],
  link: [{ name: '关于本站', url: '/?about', target: 0 }],
  js: '',
  sensitive: '',
  install: false,
  db: { version: DB_VERSION },
};

const SEED_ARTICLES = [
  {
    id: 'about',
    cid: 'default',
    path: 'article/about',
    title: '关于本站',
    intro: '',
    img: '',
    tag: ['默认'],
    isTop: 0,
    isPrivate: 0,
    isComment: 0,
    isFk: 1,
    createTime: 1682065817,
    updateTime: 1682065817,
    content:
      '这里是你的新博客，基于清雨博客（Prain）搭建。\n\n#1 开始写作\n进入后台 → 写文章。内容使用 fk 标记语言：\n[b 加粗]、[i 斜体]、[R 红色]、[> 引用]、[img 图片地址]、[file 附件地址 文件名]。\n\n#1 修改外观\n后台 → 设置，可以改标题、头像、简介；后台 → 主题，可以导入或切换主题。\n\n#1 关于本平台\n本站由 YerinBlog 免费提供，运行在 Cloudflare Workers 免费额度上，访问量较大时可能临时不可用。',
  },
  {
    id: 'message',
    cid: 'default',
    path: 'article/message',
    title: '留言板',
    intro: '',
    img: '',
    tag: ['默认'],
    isTop: 0,
    isPrivate: 0,
    isComment: 1,
    isFk: 1,
    createTime: 1682065817,
    updateTime: 1682065817,
    content: '这里是留言板，欢迎留言。',
  },
];

export interface Article {
  id: string;
  cid: string;
  path: string;
  title: string;
  intro: string;
  img: string;
  tag: string[];
  isTop: number;
  isPrivate: number;
  isComment: number;
  isFk: number;
  views: number;
  comments: number;
  createTime: number;
  updateTime: number;
  content: string;
}

export interface Comment {
  aid: string;
  id: number;
  pid: number;
  admin: number;
  name: string;
  contact: string;
  content: string;
  ip: string;
  time: number;
}

function rowToArticle(row: any): Article {
  let tag: string[] = [];
  try {
    tag = JSON.parse(row.tag || '[]');
  } catch {
    tag = [];
  }
  return { ...row, tag };
}

/** 读取配置 */
export async function getConf(env: Env): Promise<AnyObj> {
  const row = await env.DB.prepare('SELECT data FROM conf WHERE site = ?1').bind(siteOf(env)).first<{ data: string }>();
  if (!row) return { ...DEFAULT_CONF };
  try {
    const data = JSON.parse(row.data);
    return { ...DEFAULT_CONF, ...data };
  } catch {
    return { ...DEFAULT_CONF };
  }
}

/** 保存配置 */
export async function saveConf(env: Env, conf: AnyObj): Promise<void> {
  await env.DB.prepare('INSERT INTO conf (site, data) VALUES (?1, ?2) ON CONFLICT(site) DO UPDATE SET data = excluded.data')
    .bind(siteOf(env), JSON.stringify(conf))
    .run();
}

/** 局部更新配置（等价 conf($name,$value)） */
export async function confSet(env: Env, patch: AnyObj): Promise<AnyObj> {
  const conf = await getConf(env);
  Object.assign(conf, patch);
  await saveConf(env, conf);
  return conf;
}

/** 初始化站点数据（首次访问 / 新注册时） */
export async function ensureInit(env: Env): Promise<void> {
  const S = siteOf(env);
  const row = await env.DB.prepare('SELECT 1 FROM conf WHERE site = ?1').bind(S).first();
  if (row) return;
  const conf = JSON.parse(JSON.stringify(DEFAULT_CONF));
  await saveConf(env, conf);
  for (const a of SEED_ARTICLES) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO article (site,id,cid,path,title,intro,img,tag,isTop,isPrivate,isComment,isFk,views,comments,createTime,updateTime,content)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,0,0,?13,?14,?15)`
    )
      .bind(S, a.id, a.cid, a.path, a.title, a.intro, a.img, JSON.stringify(a.tag), a.isTop, a.isPrivate, a.isComment, a.isFk, a.createTime, a.updateTime, a.content)
      .run();
  }
}

/** 全量文章（按创建时间倒序，等同 db('article',[],['createTime'=>1])） */
export async function listArticles(env: Env): Promise<Record<string, Article>> {
  const res = await env.DB.prepare('SELECT * FROM article WHERE site = ?1 ORDER BY createTime DESC').bind(siteOf(env)).all<any>();
  const out: Record<string, Article> = {};
  for (const row of res.results || []) out[row.id] = rowToArticle(row);
  return out;
}

export async function getArticleById(env: Env, id: string): Promise<Article | null> {
  const row = await env.DB.prepare('SELECT * FROM article WHERE site = ?1 AND id = ?2').bind(siteOf(env), id).first<any>();
  return row ? rowToArticle(row) : null;
}

export async function insertArticle(env: Env, a: Article): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO article (site,id,cid,path,title,intro,img,tag,isTop,isPrivate,isComment,isFk,views,comments,createTime,updateTime,content)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`
  )
    .bind(
      siteOf(env),
      a.id,
      a.cid,
      a.path,
      a.title,
      a.intro,
      a.img,
      JSON.stringify(a.tag || []),
      a.isTop,
      a.isPrivate,
      a.isComment,
      a.isFk,
      a.views,
      a.comments,
      a.createTime,
      a.updateTime,
      a.content
    )
    .run();
}

export async function updateArticleRow(env: Env, a: Article): Promise<void> {
  await env.DB.prepare(
    `UPDATE article SET cid=?3,path=?4,title=?5,intro=?6,img=?7,tag=?8,isTop=?9,isPrivate=?10,isComment=?11,isFk=?12,views=?13,comments=?14,createTime=?15,updateTime=?16,content=?17 WHERE site=?1 AND id=?2`
  )
    .bind(
      siteOf(env),
      a.id,
      a.cid,
      a.path,
      a.title,
      a.intro,
      a.img,
      JSON.stringify(a.tag || []),
      a.isTop,
      a.isPrivate,
      a.isComment,
      a.isFk,
      a.views,
      a.comments,
      a.createTime,
      a.updateTime,
      a.content
    )
    .run();
}

export async function deleteArticleRow(env: Env, id: string): Promise<void> {
  const S = siteOf(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM article WHERE site = ?1 AND id = ?2').bind(S, id),
    env.DB.prepare('DELETE FROM comment WHERE site = ?1 AND aid = ?2').bind(S, id),
  ]);
}

export async function incrementArticleViews(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE article SET views = views + 1 WHERE site = ?1 AND id = ?2').bind(siteOf(env), id).run();
}

/** 评论列表 */
export async function listComments(env: Env, aid: string): Promise<Comment[]> {
  const res = await env.DB.prepare('SELECT * FROM comment WHERE site = ?1 AND aid = ?2 ORDER BY id ASC').bind(siteOf(env), aid).all<Comment>();
  return res.results || [];
}

export async function insertComment(env: Env, c: Comment): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO comment (site,aid,id,pid,admin,name,contact,content,ip,time) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
  )
    .bind(siteOf(env), c.aid, c.id, c.pid, c.admin, c.name, c.contact, c.content, c.ip, c.time)
    .run();
}

export async function deleteCommentRow(env: Env, aid: string, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM comment WHERE site = ?1 AND aid = ?2 AND id = ?3').bind(siteOf(env), aid, id).run();
}

export async function countComments(env: Env, aid: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM comment WHERE site = ?1 AND aid = ?2').bind(siteOf(env), aid).first<{ n: number }>();
  return row?.n || 0;
}

export async function setArticleComments(env: Env, id: string, count: number): Promise<void> {
  await env.DB.prepare('UPDATE article SET comments = ?3 WHERE site = ?1 AND id = ?2').bind(siteOf(env), id, count).run();
}

export async function recentCommentByIp(env: Env, aid: string, ip: string, content: string, since: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM comment WHERE site=?1 AND aid=?2 AND ip=?3 AND content=?4 AND time>?5')
    .bind(siteOf(env), aid, ip, content, since)
    .first<{ n: number }>();
  return row?.n || 0;
}

/** 错误日志 */
export async function addError(env: Env, ip: string, url: string, content: string): Promise<void> {
  await env.DB.prepare('INSERT INTO error (site,ip,url,time,content) VALUES (?1,?2,?3,?4,?5)')
    .bind(siteOf(env), ip, url, Math.floor(Date.now() / 1000), content)
    .run();
}

export async function listErrors(env: Env): Promise<AnyObj[]> {
  const res = await env.DB.prepare('SELECT * FROM error WHERE site = ?1 ORDER BY time DESC LIMIT 500').bind(siteOf(env)).all<any>();
  return res.results || [];
}

export async function clearErrors(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM error WHERE site = ?1').bind(siteOf(env)).run();
}

/** ini（扩展配置） */
export async function getIniAll(env: Env): Promise<AnyObj> {
  const res = await env.DB.prepare('SELECT name,data FROM ini WHERE site = ?1').bind(siteOf(env)).all<{ name: string; data: string }>();
  const out: AnyObj = {};
  for (const row of res.results || []) {
    try {
      out[row.name] = JSON.parse(row.data);
    } catch {
      out[row.name] = {};
    }
  }
  return out;
}

export async function saveIni(env: Env, name: string, data: any): Promise<void> {
  await env.DB.prepare('INSERT INTO ini (site,name,data) VALUES (?1,?2,?3) ON CONFLICT(site,name) DO UPDATE SET data=excluded.data')
    .bind(siteOf(env), name, JSON.stringify(data ?? {}))
    .run();
}

/** 上传文件索引 */
export async function addFile(env: Env, f: { path: string; name: string; size: number; mime: string; kvkey: string }): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO file (site,path,name,size,mime,time,kvkey) VALUES (?1,?2,?3,?4,?5,?6,?7)')
    .bind(siteOf(env), f.path, f.name, f.size, f.mime, Math.floor(Date.now() / 1000), f.kvkey)
    .run();
}

export async function getFile(env: Env, path: string): Promise<AnyObj | null> {
  return env.DB.prepare('SELECT * FROM file WHERE site = ?1 AND path = ?2').bind(siteOf(env), path).first<any>();
}

export async function deleteFileRow(env: Env, path: string): Promise<void> {
  await env.DB.prepare('DELETE FROM file WHERE site = ?1 AND path = ?2').bind(siteOf(env), path).run();
}

/** 主题 / 扩展包 */
export async function listPkgs(env: Env, type: 'tpl' | 'ext'): Promise<AnyObj[]> {
  const res = await env.DB.prepare('SELECT * FROM pkg WHERE site = ?1 AND type = ?2 ORDER BY time ASC').bind(siteOf(env), type).all<any>();
  return (res.results || []).map((r) => ({ ...r, conf: safeJson(r.conf), files: safeJson(r.files, []) }));
}

export async function getPkg(env: Env, type: string, id: string): Promise<AnyObj | null> {
  const row = await env.DB.prepare('SELECT * FROM pkg WHERE site=?1 AND type=?2 AND id=?3').bind(siteOf(env), type, id).first<any>();
  return row ? { ...row, conf: safeJson(row.conf), files: safeJson(row.files, []) } : null;
}

export async function savePkg(env: Env, type: string, id: string, conf: AnyObj, files: string[], installed: number): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO pkg (site,type,id,conf,files,installed,time) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(site,type,id) DO UPDATE SET conf=excluded.conf,files=excluded.files,installed=excluded.installed'
  )
    .bind(siteOf(env), type, id, JSON.stringify(conf || {}), JSON.stringify(files || []), installed, Math.floor(Date.now() / 1000))
    .run();
}

export async function deletePkg(env: Env, type: string, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM pkg WHERE site=?1 AND type=?2 AND id=?3').bind(siteOf(env), type, id).run();
}

function safeJson(s: string, fallback: any = {}): any {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/** 访客记录（可选，用于简易统计） */
export async function addVisit(env: Env, ip: string, path: string, ua: string): Promise<void> {
  await env.DB.prepare('INSERT INTO visit (site,ip,path,ua,time) VALUES (?1,?2,?3,?4,?5)')
    .bind(siteOf(env), ip, path, ua.slice(0, 200), Math.floor(Date.now() / 1000))
    .run();
}

export async function countVisits(env: Env, since: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM visit WHERE site = ?1 AND time > ?2').bind(siteOf(env), since).first<{ n: number }>();
  return row?.n || 0;
}

/** 删站：清空该 site 的所有数据 */
export async function purgeSite(env: Env, site: string): Promise<void> {
  const S = site;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM conf WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM ini WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM article WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM comment WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM error WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM file WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM pkg WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM captcha WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM visit WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM domain WHERE site=?1').bind(S),
    env.DB.prepare('DELETE FROM site WHERE id=?1').bind(S),
  ]);
}

export { arrWhere } from './util';
