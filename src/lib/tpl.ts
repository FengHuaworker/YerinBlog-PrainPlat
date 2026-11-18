/**
 * Prain 模板引擎（解释执行，不依赖 eval）
 * 支持原版语法：{$var} {#CONST} {{ 语句 }} {if}{elseif}{else}{/if}
 * {foreach}{/foreach} {include xxx} {url xxx} <!-- hook.xxx -->
 */

import { AnyObj } from './util';
import { Expression, ExprContext, arrInit, phpTruthy, toStr } from './expr';

type Node =
  | { t: 'text'; v: string }
  | { t: 'echo'; e: Expression }
  | { t: 'raw'; stmts: string[] }
  | { t: 'if'; branches: { cond: Expression | null; body: Node[] }[] }
  | { t: 'for'; e: Expression; as?: string; key?: string; body: Node[] }
  | { t: 'inc'; name: string; kind: 'tpl' | 'admin' | 'plain' }
  | { t: 'url'; raw: string }
  | { t: 'hook'; name: string }
  | { t: 'ifexpr'; e: Expression; mode: 'plain' | 'colon'; cons?: string; alt?: string };

export interface RenderContext {
  /** 缓存命名空间（主题 / 后台必须区分，否则同名 include 会串） */
  ns?: string;
  scope: AnyObj;
  constants: AnyObj;
  functions: Record<string, (...args: any[]) => any>;
  hooks: Record<string, string>;
  /** 解析模板内容：kind=tpl 主题模板，admin 后台模板 */
  load: (name: string, kind: 'tpl' | 'admin' | 'plain') => Promise<string | null>;
  depth?: number;
}

const parseCache = new Map<string, Node[]>();
const exprCache = new Map<string, Expression>();

function expr(source: string): Expression {
  let e = exprCache.get(source);
  if (!e) {
    e = new Expression(source);
    exprCache.set(source, e);
  }
  return e;
}

const TOKEN_RE = /\{\{([\s\S]*?)\}\}|\{#\s*([\s\S]*?)\}|\{(\$[\s\S]*?)\}|\{(\/if|\/foreach|if|elseif|foreach|else|include|url)\b([\s\S]*?)\}|<!--\s*hook\.(\w+)\s*-->|\/\/\s*hook\.(\w+)/g;

/** 拆分顶层分隔符（忽略引号/括号内的） */
function splitTopLevel(src: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      cur += ch;
      if (ch === quote && src[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findTopLevelColon(src: string): number {
  let quote = '';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

function hasTopLevelQuestion(src: string): boolean {
  let quote = '';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === quote && src[i - 1] !== '\\') quote = ''; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === '?' && depth === 0) return true;
  }
  return false;
}

/** 解析模板为 AST */
export function parseTemplate(source: string): Node[] {
  const root: Node[] = [];
  const stack: { nodes: Node[]; node?: Extract<Node, { t: 'if' | 'for' }> }[] = [{ nodes: root }];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  const pushText = (text: string) => {
    if (!text) return;
    stack[stack.length - 1].nodes.push({ t: 'text', v: text });
  };

  const currentIf = (): Extract<Node, { t: 'if' }> | null => {
    const top = stack[stack.length - 1];
    if (top.node && top.node.t === 'if') return top.node as Extract<Node, { t: 'if' }>;
    return null;
  };

  while ((m = TOKEN_RE.exec(source))) {
    pushText(source.slice(last, m.index));
    last = m.index + m[0].length;

    if (m[1] !== undefined) {
      // {{ 多行语句 }}
      const stmts = splitTopLevel(m[1], ';').map((s) => s.trim()).filter(Boolean);
      stack[stack.length - 1].nodes.push({ t: 'raw', stmts });
      continue;
    }
    if (m[2] !== undefined) {
      stack[stack.length - 1].nodes.push({ t: 'echo', e: expr(arrInit(m[2].trim())) });
      continue;
    }
    if (m[3] !== undefined) {
      stack[stack.length - 1].nodes.push({ t: 'echo', e: expr(arrInit(m[3].trim())) });
      continue;
    }
    if (m[4] !== undefined) {
      const kw = m[4];
      const rest = (m[5] || '').trim();
      if (kw === 'if') {
        if (hasTopLevelQuestion(rest)) {
          stack[stack.length - 1].nodes.push({ t: 'ifexpr', e: expr(arrInit(rest)), mode: 'plain' });
          continue;
        }
        const colon = findTopLevelColon(rest);
        if (colon > 0) {
          const condSrc = rest.slice(0, colon);
          const after = rest.slice(colon + 1);
          const colon2 = findTopLevelColon(after);
          const cons = colon2 >= 0 ? after.slice(0, colon2) : after;
          const alt = colon2 >= 0 ? after.slice(colon2 + 1) : undefined;
          stack[stack.length - 1].nodes.push({ t: 'ifexpr', e: expr(arrInit(condSrc)), mode: 'colon', cons, alt });
          continue;
        }
        const node: Extract<Node, { t: 'if' }> = { t: 'if', branches: [{ cond: expr(arrInit(rest)), body: [] }] };
        stack[stack.length - 1].nodes.push(node);
        stack.push({ nodes: node.branches[0].body, node });
        continue;
      }
      if (kw === 'elseif') {
        const node = currentIf();
        if (!node) continue;
        const body: Node[] = [];
        node.branches.push({ cond: expr(arrInit(rest)), body });
        stack[stack.length - 1] = { nodes: body, node };
        continue;
      }
      if (kw === 'else') {
        const node = currentIf();
        if (!node) continue;
        const body: Node[] = [];
        node.branches.push({ cond: null, body });
        stack[stack.length - 1] = { nodes: body, node };
        continue;
      }
      if (kw === '/if') {
        stack.pop();
        continue;
      }
      if (kw === 'foreach') {
        const asMatch = /^(.+?)\s+as\s+\$(\w+)(?:\s*=>\s*\$(\w+))?$/.exec(rest);
        const node: Extract<Node, { t: 'for' }> = asMatch
          ? { t: 'for', e: expr(arrInit(asMatch[1].trim())), key: asMatch[2], as: asMatch[3], body: [] }
          : { t: 'for', e: expr(arrInit(rest)), body: [] };
        stack[stack.length - 1].nodes.push(node);
        stack.push({ nodes: node.body, node });
        continue;
      }
      if (kw === '/foreach') {
        stack.pop();
        continue;
      }
      if (kw === 'include') {
        const mm = /^(?:(tpl|admin)\s+)?(.+)$/.exec(rest);
        if (mm) {
          stack[stack.length - 1].nodes.push({ t: 'inc', kind: (mm[1] as any) || 'plain', name: mm[2].trim() });
        }
        continue;
      }
      if (kw === 'url') {
        stack[stack.length - 1].nodes.push({ t: 'url', raw: rest });
        continue;
      }
    }
    if (m[6] !== undefined) {
      stack[stack.length - 1].nodes.push({ t: 'hook', name: m[6] });
      continue;
    }
    if (m[7] !== undefined) {
      stack[stack.length - 1].nodes.push({ t: 'hook', name: m[7] });
      continue;
    }
  }
  pushText(source.slice(last));
  return root;
}

function getCachedParse(key: string, source: string): Node[] {
  const cached = parseCache.get(key);
  if (cached) return cached;
  const ast = parseTemplate(source);
  if (parseCache.size > 500) parseCache.clear();
  parseCache.set(key, ast);
  return ast;
}

function makeCtx(ctx: RenderContext): ExprContext {
  return { scope: ctx.scope, constants: ctx.constants, functions: ctx.functions };
}

function setPath(scope: AnyObj, path: (string | number)[], value: any): void {
  let cur: any = scope;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

/** 渲染模板源码 */
export async function renderSource(
  source: string,
  ctx: RenderContext,
  cacheKey?: string
): Promise<string> {
  const ast = cacheKey ? getCachedParse(cacheKey, source) : parseTemplate(source);
  return renderNodes(ast, ctx);
}

async function renderNodes(nodes: Node[], ctx: RenderContext): Promise<string> {
  let out = '';
  const ec = makeCtx(ctx);
  for (const node of nodes) {
    switch (node.t) {
      case 'text':
        out += node.v;
        break;
      case 'echo': {
        try {
          out += toStr(node.e.evaluate(ec));
        } catch {
          out += '';
        }
        break;
      }
      case 'raw': {
        for (const stmt of node.stmts) {
          const res: any = Expression.assignFrom(stmt, ec);
          if (res) setPath(ctx.scope, res.path || [res.name], res.value);
        }
        break;
      }
      case 'if': {
        for (const br of node.branches) {
          if (br.cond === null || phpTruthy(safeEval(br.cond, ec))) {
            out += await renderNodes(br.body, ctx);
            break;
          }
        }
        break;
      }
      case 'ifexpr': {
        const v = safeEval(node.e, ec);
        if (node.mode === 'plain') out += toStr(v);
        else {
          const cond = node.e.evaluate(ec);
          if (phpTruthy(cond)) out += node.cons ?? '';
          else out += node.alt ?? '';
        }
        break;
      }
      case 'for': {
        const data = safeEval(node.e, ec);
        if (!data || typeof data !== 'object') break;
        const entries = Array.isArray(data) ? data.map((v, i) => [i, v] as [any, any]) : Object.entries(data);
        let index = -1;
        for (const [k, v] of entries) {
          index++;
          const saved = { item: ctx.scope.item, key: ctx.scope.key, index: ctx.scope.index };
          if (node.as) {
            ctx.scope[node.as] = v;
            if (node.key) ctx.scope[node.key] = k;
          } else {
            ctx.scope.item = v;
            ctx.scope.key = k;
          }
          ctx.scope.index = index;
          out += await renderNodes(node.body, ctx);
          ctx.scope.item = saved.item;
          ctx.scope.key = saved.key;
          ctx.scope.index = saved.index;
        }
        break;
      }
      case 'inc': {
        if ((ctx.depth ?? 0) > 10) break;
        const src = await ctx.load(node.name, node.kind);
        if (src == null) break;
        out += await renderSource(src, { ...ctx, depth: (ctx.depth ?? 0) + 1 }, `${ctx.ns || 'x'}:${node.kind}:${node.name}`);
        break;
      }
      case 'url': {
        out += renderUrl(node.raw, ec, ctx);
        break;
      }
      case 'hook': {
        const snippet = ctx.hooks[node.name];
        if (snippet) {
          // 钩子内容随扩展变化，不做 AST 缓存
          out += await renderSource(snippet, { ...ctx, depth: (ctx.depth ?? 0) + 1 });
        }
        break;
      }
    }
  }
  return out;
}

function safeEval(e: Expression, ctx: ExprContext): any {
  try {
    return e.evaluate(ctx);
  } catch {
    return '';
  }
}

function renderUrl(raw: string, ec: ExprContext, ctx: RenderContext): string {
  const base = toStr(ctx.constants.URL ?? '/');
  const replaced = raw.replace(/\$([A-Za-z_]\w*(?:(?:\.[\w-]+)|(?:\[[^\]]+\]))*)/g, (_m, path: string) => {
    try {
      return toStr(expr(path.startsWith('$') ? path : `$${path}`).evaluate(ec));
    } catch {
      return '';
    }
  });
  return base + replaced;
}
