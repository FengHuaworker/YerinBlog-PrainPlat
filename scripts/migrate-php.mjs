#!/usr/bin/env node
/**
 * Prain PHP 数据迁移工具
 * 把原版 db/*.php（var_export 数组）转换成 Cloudflare D1 可执行的 import.sql
 *
 * 用法：
 *   node scripts/migrate-php.mjs /path/to/prain-1.3.4 ./import.sql
 *   npx wrangler d1 execute prain --remote --file=import.sql
 */

import fs from 'node:fs';
import path from 'node:path';

/** 解析 PHP var_export 输出（array(...) / [...] / 标量） */
function parsePhp(src) {
  let i = 0;
  const s = src.replace(/^\s*<\?php/, '').replace(/\?>\s*$/, '');
  function ws() {
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  function parseValue() {
    ws();
    if (s.startsWith('array', i)) {
      i += 5;
      ws();
      if (s[i] === '(') return parseArray('(', ')');
      return parseArray('[', ']');
    }
    if (s[i] === '[') return parseArray('[', ']');
    if (s[i] === "'") return parseString("'");
    if (s[i] === '"') return parseString('"');
    if (/[-0-9]/.test(s[i])) {
      let j = i;
      if (s[j] === '-') j++;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      i = j;
      return n;
    }
    for (const kw of ['true', 'false', 'null']) {
      if (s.startsWith(kw, i)) {
        i += kw.length;
        return kw === 'true' ? true : kw === 'false' ? false : null;
      }
    }
    throw new Error(`无法解析的值 @${i}: ${s.slice(i, i + 40)}`);
  }
  function parseString(quote) {
    i++;
    let out = '';
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\' && i + 1 < s.length) {
        out += s[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) {
        i++;
        return out;
      }
      out += ch;
      i++;
    }
    return out;
  }
  function parseArray(open, close) {
    i++;
    const arr = [];
    const obj = {};
    let isList = true;
    for (;;) {
      ws();
      if (s[i] === close) {
        i++;
        break;
      }
      if (s[i] === ',') {
        i++;
        continue;
      }
      let key = null;
      const save = i;
      const v = parseValue();
      ws();
      if (s.startsWith('=>', i)) {
        i += 2;
        key = v;
        const val = parseValue();
        obj[String(key)] = val;
        isList = false;
      } else {
        i = save;
        const item = parseValue();
        arr.push(item);
        isList = isList && key === null;
        continue;
      }
      ws();
      if (s[i] === ',') i++;
    }
    return isList ? arr : obj;
  }
  ws();
  if (s.startsWith('return', i)) {
    i += 6;
    const v = parseValue();
    ws();
    if (s[i] === ';') i++;
    return v;
  }
  return parseValue();
}

function readPhp(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return parsePhp(raw);
}

const sqlStr = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sqlNum = (v) => (Number.isFinite(Number(v)) ? String(Number(v)) : '0');

function main() {
  const root = process.argv[2];
  const outFile = process.argv[3] || 'import.sql';
  if (!root) {
    console.error('用法: node scripts/migrate-php.mjs <prain-php-root> [import.sql]');
    process.exit(1);
  }
  const dbDir = path.join(root, 'db');
  const conf = readPhp(path.join(dbDir, 'conf.php'));
  conf.install = true;
  conf.db = conf.db || { version: '1.1.6' };

  const lines = [];
  lines.push('-- 由 scripts/migrate-php.mjs 生成');
  lines.push('DELETE FROM article;');
  lines.push('DELETE FROM comment;');
  lines.push('DELETE FROM error;');
  lines.push('DELETE FROM ini;');
  lines.push('DELETE FROM conf;');
  lines.push(`INSERT INTO conf (id, data) VALUES (1, ${sqlStr(JSON.stringify(conf))});`);

  // ini
  const iniPath = path.join(dbDir, 'ini.php');
  if (fs.existsSync(iniPath)) {
    const ini = readPhp(iniPath) || {};
    for (const [k, v] of Object.entries(ini)) {
      lines.push(`INSERT INTO ini (name, data) VALUES (${sqlStr(k)}, ${sqlStr(JSON.stringify(v))});`);
    }
  }

  // 文章
  const articleList = readPhp(path.join(dbDir, 'article.php')) || {};
  let count = 0;
  for (const [id, a] of Object.entries(articleList)) {
    const contentPath = path.join(dbDir, `${a.path || 'article/' + id}.php`);
    const content = fs.existsSync(contentPath) ? readPhp(contentPath) : '';
    const tag = Array.isArray(a.tag) ? a.tag : [];
    lines.push(
      `INSERT INTO article (id,cid,path,title,intro,img,tag,isTop,isPrivate,isComment,isFk,views,comments,createTime,updateTime,content) VALUES (` +
        [
          sqlStr(id),
          sqlStr(a.cid || ''),
          sqlStr(a.path || `article/${id}`),
          sqlStr(a.title || ''),
          sqlStr(a.intro || ''),
          sqlStr(a.img || ''),
          sqlStr(JSON.stringify(tag)),
          sqlNum(a.isTop),
          sqlNum(a.isPrivate),
          sqlNum(a.isComment),
          sqlNum(a.isFk),
          sqlNum(a.views),
          sqlNum(a.comments),
          sqlNum(a.createTime),
          sqlNum(a.updateTime || a.createTime),
          sqlStr(typeof content === 'string' ? content : ''),
        ].join(',') +
        ');'
    );
    count++;
  }

  // 评论
  let ccount = 0;
  const commentDir = path.join(dbDir, 'comment');
  if (fs.existsSync(commentDir)) {
    for (const f of fs.readdirSync(commentDir)) {
      if (!f.endsWith('.php')) continue;
      const aid = f.replace(/\.php$/, '');
      const list = readPhp(path.join(commentDir, f)) || [];
      for (const c of list) {
        lines.push(
          `INSERT INTO comment (aid,id,pid,admin,name,contact,content,ip,time) VALUES (` +
            [sqlStr(aid), sqlNum(c.id), sqlNum(c.pid), sqlNum(c.admin), sqlStr(c.name), sqlStr(c.contact), sqlStr(c.content), sqlStr(c.ip), sqlNum(c.time)].join(',') +
            ');'
        );
        ccount++;
      }
    }
  }

  // 错误日志
  const errPath = path.join(dbDir, 'error.php');
  if (fs.existsSync(errPath)) {
    const errors = readPhp(errPath) || [];
    for (const e of errors) {
      lines.push(`INSERT INTO error (ip,url,time,content) VALUES (${sqlStr(e.ip)},${sqlStr(e.url)},${sqlNum(e.time)},${sqlStr(e.content)});`);
    }
  }

  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
  console.log(`已生成 ${outFile}: ${count} 篇文章, ${ccount} 条评论`);
  console.log('下一步: npx wrangler d1 execute prain --remote --file=' + outFile);
}

main();
