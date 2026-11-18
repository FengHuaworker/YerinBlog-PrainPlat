/**
 * Prain 模板表达式求值器
 * 目标：在不执行 PHP 的前提下，支持原版模板里的表达式写法
 *  - {$conf.title} / {$article.list} / {$item.tag.name}
 *  - {if $a == 'x'} / {if LOGIN} / {if count($list) > 2}
 *  - 三元 / 拼接（.）/ 比较 / isset() / empty()
 *  - {#date('Y-m-d', time())} 之类的常量与受限函数
 */

import { dates, humanDate } from './util';

export type AnyObj = Record<string, any>;
type Node = { t: string; [k: string]: any };

const FUNCTION_WHITELIST = new Set([
  'count', 'isset', 'empty', 'in_array', 'array_key_exists', 'is_array', 'is_string', 'is_numeric',
  'date', 'dates', 'time', 'mktime', 'strtotime', 'number_format', 'round', 'floor', 'ceil', 'max', 'min', 'abs',
  'explode', 'implode', 'join', 'trim', 'ltrim', 'rtrim', 'strtolower', 'strtoupper', 'ucfirst',
  'str_replace', 'str_ireplace', 'substr', 'mb_substr', 'mb_strlen', 'strlen', 'strpos', 'strrpos', 'str_contains',
  'htmlentities', 'htmlspecialchars', 'strip_tags', 'nl2br', 'urlencode', 'urldecode', 'json_encode', 'json_decode',
  'sprintf', 'intval', 'floatval', 'strval', 'boolval', 'md5', 'rand', 'mt_rand', 'uniqid',
  'ip', 'getRunTime', 'getMemory', 'php_uname', 'ini_get', 'gethostbyname', 'phpversion', 'memory_get_usage',
  'is_file', 'file_exists', 'dirname', 'basename', 'pathinfo', 'getimagesize', 'is_mobile',
]);

/** PHP 风格的真假判断 */
export function phpTruthy(v: any): boolean {
  if (v === false || v === null || v === undefined) return false;
  if (v === 0 || v === '0' || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}

/** 值转字符串（对照 PHP echo） */
export function toStr(v: any): string {
  if (v === null || v === undefined || v === false) return '';
  if (v === true) return '1';
  if (Array.isArray(v)) return 'Array';
  if (typeof v === 'object') return 'Array';
  return String(v);
}

/**
 * 对照 Tpl::arrInit：$conf.title → $conf['title']
 * 引号内的点不处理
 */
export function arrInit(expr: string): string {
  let out = String(expr);
  const quoted: string[] = [];
  out = out.replace(/('[^']*')|("[^"]*")/g, (m) => {
    quoted.push(m.replace(/\./g, '\u0000'));
    return `\u0001${quoted.length - 1}\u0001`;
  });
  out = out.replace(/(?<!['"\d])\.([\w-]+(?:\.[\w-]+)*)/g, (_m, path: string) => {
    const keys = path.split('.').map((k) => `['${k}']`).join('');
    return keys;
  });
  out = out.replace(/\u0001(\d+)\u0001/g, (_m, i) => quoted[Number(i)]);
  return out.replace(/\u0000/g, '.');
}

interface Token { t: string; v: any; }

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    // 变量
    if (ch === '$') {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ t: 'var', v: s.slice(i + 1, j) });
      i = j;
      continue;
    }
    // 字符串
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let out = '';
      while (j < s.length) {
        if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; continue; }
        if (s[j] === quote) break;
        out += s[j];
        j++;
      }
      tokens.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    // 数字
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    // 标识符 / 常量 / 函数
    if (/[A-Za-z_\\]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_\\]/.test(s[j])) j++;
      tokens.push({ t: 'ident', v: s.slice(i, j) });
      i = j;
      continue;
    }
    // 多字符运算符
    const ops = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '=>', '<>', '??'];
    const op = ops.find((o) => s.startsWith(o, i));
    if (op) { tokens.push({ t: 'op', v: op }); i += op.length; continue; }
    if ('+-*/%.!?:()[],<>='.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '@') { i++; continue; }
    // 未知字符，跳过
    i++;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  next(): Token | undefined { return this.tokens[this.pos++]; }
  eat(v: string): boolean {
    const t = this.peek();
    if (t && t.t === 'op' && t.v === v) { this.pos++; return true; }
    return false;
  }
  expect(v: string): void {
    if (!this.eat(v)) throw new Error(`表达式缺少 ${v}`);
  }

  parse(): Node { return this.ternary(); }

  private ternary(): Node {
    const cond = this.or();
    if (this.eat('?')) {
      if (this.eat(':')) {
        const alt = this.ternary();
        return { t: 'ternary', cond, cons: cond, alt };
      }
      const cons = this.ternary();
      this.expect(':');
      const alt = this.ternary();
      return { t: 'ternary', cond, cons, alt };
    }
    return cond;
  }
  private or(): Node {
    let left = this.and();
    while (this.peek()?.t === 'op' && (this.peek()!.v === '||' || this.peek()!.v === 'or')) {
      this.next();
      const right = this.and();
      left = { t: 'bin', op: '||', left, right };
    }
    return left;
  }
  private and(): Node {
    let left = this.equality();
    while (this.peek()?.t === 'op' && (this.peek()!.v === '&&' || this.peek()!.v === 'and')) {
      this.next();
      const right = this.equality();
      left = { t: 'bin', op: '&&', left, right };
    }
    return left;
  }
  private equality(): Node {
    let left = this.comparison();
    while (this.peek()?.t === 'op' && ['==', '!=', '===', '!==', '<>'].includes(this.peek()!.v)) {
      const op = this.next()!.v;
      const right = this.comparison();
      left = { t: 'bin', op: op === '<>' ? '!=' : op, left, right };
    }
    return left;
  }
  private comparison(): Node {
    let left = this.concat();
    while (this.peek()?.t === 'op' && ['<', '>', '<=', '>='].includes(this.peek()!.v)) {
      const op = this.next()!.v;
      const right = this.concat();
      left = { t: 'bin', op, left, right };
    }
    return left;
  }
  private concat(): Node {
    let left = this.additive();
    while (this.peek()?.t === 'op' && this.peek()!.v === '.') {
      this.next();
      const right = this.additive();
      left = { t: 'bin', op: '.', left, right };
    }
    return left;
  }
  private additive(): Node {
    let left = this.multiplicative();
    while (this.peek()?.t === 'op' && ['+', '-'].includes(this.peek()!.v)) {
      const op = this.next()!.v;
      const right = this.multiplicative();
      left = { t: 'bin', op, left, right };
    }
    return left;
  }
  private multiplicative(): Node {
    let left = this.unary();
    while (this.peek()?.t === 'op' && ['*', '/', '%'].includes(this.peek()!.v)) {
      const op = this.next()!.v;
      const right = this.unary();
      left = { t: 'bin', op, left, right };
    }
    return left;
  }
  private unary(): Node {
    const t = this.peek();
    if (t?.t === 'op' && (t.v === '!' || t.v === '-' || t.v === '+')) {
      this.next();
      return { t: 'unary', op: t.v, arg: this.unary() };
    }
    if (t?.t === 'ident' && t.v.toLowerCase() === 'not') {
      this.next();
      return { t: 'unary', op: '!', arg: this.unary() };
    }
    return this.postfix();
  }
  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.eat('[')) {
        const idx = this.ternary();
        this.expect(']');
        node = { t: 'index', obj: node, idx };
      } else if (this.eat('(')) {
        const args: Node[] = [];
        if (!this.eat(')')) {
          do {
            args.push(this.ternary());
          } while (this.eat(','));
          this.expect(')');
        }
        node = { t: 'call', callee: node, args };
      } else break;
    }
    return node;
  }
  private primary(): Node {
    const t = this.next();
    if (!t) return { t: 'lit', v: '' };
    if (t.t === 'num' || t.t === 'str') return { t: 'lit', v: t.v };
    if (t.t === 'var') return { t: 'var', name: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = this.ternary();
      this.expect(')');
      return e;
    }
    if (t.t === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (!this.eat(']')) {
        do {
          items.push(this.ternary());
        } while (this.eat(','));
        this.expect(']');
      }
      return { t: 'array', items };
    }
    if (t.t === 'ident') {
      const lower = t.v.toLowerCase();
      if (lower === 'true') return { t: 'lit', v: true };
      if (lower === 'false') return { t: 'lit', v: false };
      if (lower === 'null') return { t: 'lit', v: null };
      return { t: 'const', name: t.v };
    }
    return { t: 'lit', v: '' };
  }
}

export interface ExprContext {
  scope: AnyObj;
  constants: AnyObj;
  functions?: Record<string, (...args: any[]) => any>;
  /** 用于 isset() 判断时访问未定义变量不报错 */
  has?: (name: string) => boolean;
}

export class Expression {
  private ast: Node;
  private src: string;
  constructor(source: string) {
    this.src = source;
    const prepared = arrInit(source.trim());
    this.ast = new Parser(tokenize(prepared)).parse();
  }
  get source(): string { return this.src; }

  evaluate(ctx: ExprContext): any {
    return evalNode(this.ast, ctx);
  }

  /** 用于 {{ }} 赋值语句 */
  static assignFrom(source: string, ctx: ExprContext): { name: string; value: any } | null {
    const prepared = arrInit(source.trim());
    const tokens = tokenize(prepared);
    let depth = 0;
    let eqIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.t === 'op') {
        if (['(', '[', '{'].includes(t.v)) depth++;
        else if ([')', ']', '}'].includes(t.v)) depth--;
        else if (t.v === '=' && depth === 0) { eqIndex = i; break; }
      }
    }
    if (eqIndex < 1) return null;
    const lhsTokens = tokens.slice(0, eqIndex);
    const rhsTokens = tokens.slice(eqIndex + 1);
    if (!lhsTokens.length || lhsTokens[0].t !== 'var') return null;
    const rhs = new Parser(rhsTokens).parse();
    const value = evalNode(rhs, ctx);
    // 目标路径：$a['b']['c']
    const path: (string | number)[] = [lhsTokens[0].v];
    for (let i = 1; i < lhsTokens.length; i++) {
      const t = lhsTokens[i];
      if (t.t === 'op' && t.v === '[') {
        const inner = lhsTokens[i + 1];
        if (inner && (inner.t === 'str' || inner.t === 'num')) path.push(inner.v);
        i += 2;
      }
    }
    return { name: path.map(String).join('\u0000'), value, path } as any;
  }
}

function resolveVar(ctx: ExprContext, name: string): any {
  if (ctx.scope && name in ctx.scope) return ctx.scope[name];
  return undefined;
}

function getPath(ctx: ExprContext, node: Node): any[] {
  const path: any[] = [];
  let cur = node;
  while (cur && cur.t === 'index') {
    path.unshift(evalNode(cur.idx, ctx));
    cur = cur.obj;
  }
  if (cur && cur.t === 'var') {
    path.unshift(cur.name);
    return path;
  }
  if (cur && cur.t === 'const') {
    path.unshift(cur.name);
    return path;
  }
  return [];
}

function evalNode(node: Node, ctx: ExprContext): any {
  switch (node.t) {
    case 'lit':
      return node.v;
    case 'array':
      return node.items.map((n: Node) => evalNode(n, ctx));
    case 'var':
      return resolveVar(ctx, node.name);
    case 'const': {
      const name = node.name;
      if (ctx.constants && name in ctx.constants) return ctx.constants[name];
      return ctx.functions?.[name] ?? name;
    }
    case 'index': {
      const obj = evalNode(node.obj, ctx);
      const idx = evalNode(node.idx, ctx);
      if (obj == null) return undefined;
      return (obj as any)[idx];
    }
    case 'unary': {
      const v = evalNode(node.arg, ctx);
      if (node.op === '!') return !phpTruthy(v);
      if (node.op === '-') return -Number(v || 0);
      return Number(v || 0);
    }
    case 'ternary': {
      const c = evalNode(node.cond, ctx);
      return phpTruthy(c) ? evalNode(node.cons, ctx) : evalNode(node.alt, ctx);
    }
    case 'call': {
      const callee = node.callee;
      const name = callee.t === 'const' ? callee.name : callee.t === 'var' ? callee.name : '';
      const args = node.args as Node[];
      if (name === 'isset') {
        const path = getPath(ctx, args[0]);
        if (!path.length) return false;
        let cur: any = ctx.scope;
        for (const key of path) {
          if (cur == null || !(key in Object(cur))) return false;
          cur = cur[key];
        }
        return cur !== null && cur !== undefined;
      }
      if (name === 'empty') {
        const path = getPath(ctx, args[0]);
        if (!path.length) return true;
        let cur: any = ctx.scope;
        for (const key of path) {
          if (cur == null || !(key in Object(cur))) return true;
          cur = cur[key];
        }
        return !phpTruthy(cur);
      }
      const fn = ctx.functions?.[name];
      if (fn) {
        return fn(...args.map((a) => evalNode(a, ctx)));
      }
      // 未知函数：当作常量文本
      return name;
    }
    case 'bin': {
      const op = node.op;
      if (op === '&&') return phpTruthy(evalNode(node.left, ctx)) && phpTruthy(evalNode(node.right, ctx));
      if (op === '||') return phpTruthy(evalNode(node.left, ctx)) || phpTruthy(evalNode(node.right, ctx));
      const a = evalNode(node.left, ctx);
      const b = evalNode(node.right, ctx);
      switch (op) {
        case '.': return toStr(a) + toStr(b);
        case '+': return Number(a || 0) + Number(b || 0);
        case '-': return Number(a || 0) - Number(b || 0);
        case '*': return Number(a || 0) * Number(b || 0);
        case '/': return Number(b) === 0 ? 0 : Number(a || 0) / Number(b || 0);
        case '%': return Number(b) === 0 ? 0 : Number(a || 0) % Number(b || 0);
        case '==': return a == b;
        case '!=': return a != b;
        case '===': return a === b;
        case '!==': return a !== b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
        default: return '';
      }
    }
    default:
      return '';
  }
}

/** 简化版 md5（复用外部注入） */
let md5Impl: ((s: string) => string) | null = null;
export function setMd5(fn: (s: string) => string): void {
  md5Impl = fn;
}

export function defaultFunctions(extra: Record<string, (...args: any[]) => any> = {}): Record<string, (...args: any[]) => any> {
  return {
    count: (v: any) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0),
    in_array: (needle: any, haystack: any) => (Array.isArray(haystack) ? haystack.map(String).includes(String(needle)) : false),
    array_key_exists: (k: any, arr: any) => arr != null && k in arr,
    is_array: (v: any) => Array.isArray(v),
    is_string: (v: any) => typeof v === 'string',
    is_numeric: (v: any) => !isNaN(Number(v)),
    time: () => Math.floor(Date.now() / 1000),
    dates: (t?: number) => dates(t),
    humanDate: (t: number) => humanDate(t),
    number_format: (n: number, d = 0) => Number(n || 0).toFixed(d),
    round: (n: number, d = 0) => Math.round(Number(n || 0) * 10 ** d) / 10 ** d,
    floor: (n: number) => Math.floor(Number(n || 0)),
    ceil: (n: number) => Math.ceil(Number(n || 0)),
    max: (...a: any[]) => Math.max(...a.map(Number)),
    min: (...a: any[]) => Math.min(...a.map(Number)),
    abs: (n: number) => Math.abs(Number(n || 0)),
    explode: (sep: string, str: string) => String(str ?? '').split(sep),
    implode: (sep: string, arr: any) => (Array.isArray(arr) ? arr.join(sep) : ''),
    join: (sep: string, arr: any) => (Array.isArray(arr) ? arr.join(sep) : ''),
    trim: (s: any) => String(s ?? '').trim(),
    ltrim: (s: any) => String(s ?? '').replace(/^\s+/, ''),
    rtrim: (s: any) => String(s ?? '').replace(/\s+$/, ''),
    strtolower: (s: any) => String(s ?? '').toLowerCase(),
    strtoupper: (s: any) => String(s ?? '').toUpperCase(),
    ucfirst: (s: any) => String(s ?? '').replace(/^./, (c) => c.toUpperCase()),
    str_replace: (a: any, b: any, s: any) => String(s ?? '').split(String(a)).join(String(b)),
    str_ireplace: (a: any, b: any, s: any) => String(s ?? '').replace(new RegExp(String(a), 'gi'), String(b)),
    substr: (s: any, start: number, len?: number) => String(s ?? '').substr(start, len),
    mb_substr: (s: any, start: number, len?: number) => Array.from(String(s ?? '')).slice(start, len === undefined ? undefined : start + len).join(''),
    strlen: (s: any) => String(s ?? '').length,
    mb_strlen: (s: any) => Array.from(String(s ?? '')).length,
    strpos: (s: any, n: any) => String(s ?? '').indexOf(String(n)),
    strrpos: (s: any, n: any) => String(s ?? '').lastIndexOf(String(n)),
    str_contains: (s: any, n: any) => String(s ?? '').includes(String(n)),
    htmlentities: (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    htmlspecialchars: (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    strip_tags: (s: any) => String(s ?? '').replace(/<[^>]*>/g, ''),
    nl2br: (s: any) => String(s ?? '').replace(/\r\n|\r|\n/g, '<br/>'),
    urlencode: (s: any) => encodeURIComponent(String(s ?? '')),
    urldecode: (s: any) => decodeURIComponent(String(s ?? '')),
    json_encode: (v: any) => JSON.stringify(v),
    json_decode: (v: any) => { try { return JSON.parse(String(v)); } catch { return null; } },
    sprintf: (fmt: string, ...args: any[]) => {
      let i = 0;
      return String(fmt).replace(/%[sd]/g, (m) => {
        const v = args[i++];
        return m === '%d' ? String(parseInt(v, 10) || 0) : String(v ?? '');
      });
    },
    intval: (v: any) => parseInt(v, 10) || 0,
    floatval: (v: any) => parseFloat(v) || 0,
    strval: (v: any) => toStr(v),
    boolval: (v: any) => phpTruthy(v),
    md5: (v: any) => (md5Impl ? md5Impl(String(v ?? '')) : ''),
    rand: (a: number, b: number) => Math.floor(Math.random() * (Number(b) - Number(a) + 1)) + Number(a),
    mt_rand: (a: number, b: number) => Math.floor(Math.random() * (Number(b) - Number(a) + 1)) + Number(a),
    uniqid: () => Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16),
    php_uname: () => 'Cloudflare Workers',
    ini_get: () => '25M',
    gethostbyname: () => '104.16.0.0',
    phpversion: () => 'worker',
    memory_get_usage: () => 0,
    is_file: () => false,
    file_exists: () => false,
    dirname: (p: any) => String(p ?? '').split('/').slice(0, -1).join('/'),
    basename: (p: any) => String(p ?? '').split('/').pop(),
    pathinfo: (p: any) => {
      const s = String(p ?? '');
      const i = s.lastIndexOf('.');
      return { dirname: s.split('/').slice(0, -1).join('/'), basename: s.split('/').pop(), extension: i > -1 ? s.slice(i + 1) : '' };
    },
    getimagesize: () => false,
    is_mobile: () => false,
    ...extra,
  };
}
