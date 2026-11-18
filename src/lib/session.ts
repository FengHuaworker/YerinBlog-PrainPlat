/** 会话：签名 Cookie（替代 PHP session），保持原版字段语义 */

import { md5 } from './md5';
import { AnyObj } from './util';

const COOKIE = 'prain_sid';
const MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionData extends AnyObj {
  login: boolean;
  token: string;
  ip: string;
  checkIP: number;
  views: string[];
  commentName: string;
  commentContact: string;
  commentCount: number;
  loginCount: number;
  loginTime: number;
  prompt: { text?: string; url?: string } | null;
  updateAlert: number;
  isVisit: number;
}

export function defaultSession(ip: string): SessionData {
  return {
    login: false,
    token: '',
    ip,
    checkIP: 0,
    views: [],
    commentName: '',
    commentContact: '',
    commentCount: 0,
    loginCount: 0,
    loginTime: 0,
    prompt: null,
    updateAlert: 0,
    isVisit: 0,
  };
}

export class Session {
  data: SessionData;
  dirty = false;
  destroyed = false;
  constructor(data: SessionData) {
    this.data = data;
  }
  get login(): boolean {
    return !!this.data.login;
  }
  set(key: keyof SessionData | string, value: any): void {
    (this.data as any)[key] = value;
    this.dirty = true;
  }
  destroy(): void {
    this.data = defaultSession(this.data.ip);
    this.destroyed = true;
    this.dirty = true;
  }
}

let secretCache: string | null = null;

async function getSecret(env: Env): Promise<string> {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (secretCache) return secretCache;
  let s = await env.KV.get('system:secret');
  if (!s) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    s = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.KV.put('system:secret', s);
  }
  secretCache = s;
  return s;
}

function b64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

/** 通用签名令牌：平台会话、后台单点登录票据 */
export async function signToken(env: Env, data: Record<string, any>, ttlSeconds = 300): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const secret = await getSecret(env);
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyToken(env: Env, token: string | null | undefined): Promise<Record<string, any> | null> {
  if (!token || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  try {
    const secret = await getSecret(env);
    if ((await sign(payload, secret)) !== sig) return null;
    const data = JSON.parse(b64urlDecode(payload));
    if (!data || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}


function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function loadSession(req: Request, env: Env, ip: string): Promise<Session> {
  const raw = getCookie(req, COOKIE);
  if (raw && raw.includes('.')) {
    const idx = raw.lastIndexOf('.');
    const payload = raw.slice(0, idx);
    const sig = raw.slice(idx + 1);
    try {
      const secret = await getSecret(env);
      const expect = await sign(payload, secret);
      if (expect === sig) {
        const data = JSON.parse(b64urlDecode(payload));
        return new Session({ ...defaultSession(ip), ...data });
      }
    } catch {
      // 忽略坏 cookie
    }
  }
  return new Session(defaultSession(ip));
}

export async function sessionCookie(session: Session, env: Env): Promise<string> {
  if (session.destroyed) {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const secret = await getSecret(env);
  const payload = b64urlEncode(JSON.stringify(session.data));
  const sig = await sign(payload, secret);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** 原版 getToken()：md5(ip + client-ip + xff + ua + sec-ch-ua-mobile + sec-ch-ua) */
export function getToken(req: Request, ip: string): string {
  const h = req.headers;
  return md5(
    ip +
      (h.get('Client-IP') || '') +
      (h.get('X-Forwarded-For') || '') +
      (h.get('User-Agent') || '') +
      (h.get('Sec-CH-UA-Mobile') || '') +
      (h.get('Sec-CH-UA') || '')
  );
}

export function clientIp(req: Request): string {
  const h = req.headers;
  const candidates = [h.get('CF-Connecting-IP'), h.get('X-Real-IP'), h.get('X-Forwarded-For')];
  for (const c of candidates) {
    if (c) return c.split(',')[0].trim();
  }
  return '127.0.0.1';
}
