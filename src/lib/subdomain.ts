/**
 * 子域名规则与保留名单
 * 平台：example.com
 * 博客：<name>.example.com
 */

/** 精确保留：这些名字不允许注册为博客 */
export const RESERVED_EXACT = new Set<string>([
  // 基础 / 邮件 / DNS
  'www', 'ww1', 'ww2', 'web', 'webmail', 'mail', 'email', 'smtp', 'imap', 'pop', 'pop3',
  'mx', 'mx1', 'mx2', 'ns', 'ns1', 'ns2', 'ns3', 'dns', 'ftp', 'sftp', 'ssh', 'vpn',
  // 平台 / 管理
  'my', 'admin', 'administrator', 'root', 'system', 'sys', 'official', 'staff', 'team',
  'support', 'help', 'service', 'services', 'status', 'health', 'monitor', 'metrics',
  'analytics', 'stats', 'dashboard', 'dash', 'panel', 'console', 'manage', 'management',
  'control', 'settings', 'setting', 'config', 'configuration', 'setup', 'install', 'init',
  'register', 'signup', 'signin', 'login', 'logout', 'auth', 'sso', 'oauth', 'openid',
  'saml', 'account', 'accounts', 'user', 'users', 'profile', 'billing', 'pay', 'payment',
  'payments', 'checkout', 'invoice', 'order', 'orders', 'store', 'shop', 'cart',
  // 接口 / 基础设施
  'api', 'apis', 'graphql', 'ws', 'wss', 'socket', 'rpc', 'gateway', 'proxy', 'edge',
  'cache', 'db', 'database', 'sql', 'redis', 'queue', 'cron', 'worker', 'workers',
  'cloudflare', 'cf', 'cdn', 'static', 'assets', 'asset', 'img', 'image', 'images',
  'media', 'file', 'files', 'upload', 'uploads', 'download', 'downloads',
  // 内容 / 导航
  'blog', 'blogs', 'news', 'feed', 'rss', 'sitemap', 'robots', 'search', 'tag', 'tags',
  'category', 'categories', 'archive', 'archives', 'post', 'posts', 'article', 'articles',
  'page', 'pages', 'about', 'contact', 'privacy', 'terms', 'legal', 'policy', 'abuse',
  'report', 'security', 'dmca', 'copyright',
  // 开发 / 环境
  'dev', 'developer', 'developers', 'test', 'testing', 'stage', 'staging', 'beta', 'alpha',
  'demo', 'sandbox', 'preview', 'temp', 'tmp', 'git', 'github', 'gitlab', 'repo', 'registry',
  'npm', 'docker', 'k8s', 'kubernetes', 'ci', 'cd', 'build', 'deploy',
  // 品牌 / 仿冒
  'prain', 'yerin', 'yerinblog', 'myblog', 'qingyu', 'qingyu-blog',
  'secure', 'verify', 'verification', 'wallet', 'metamask', 'coinbase', 'binance', 'okx',
  'paypal', 'stripe', 'apple', 'google', 'microsoft', 'amazon', 'aws', 'azure', 'office365',
  'outlook', 'gmail', 'wechat', 'weixin', 'qq', 'alipay', 'taobao', 'jd', 'bilibili',
  'douyin', 'tiktok', 'autodiscover', 'autoconfig', 'localhost', 'whois', 'rdap', 'ptr',
  'app', 'apps', 'm', 'mobile', 'go', 'link', 'links', 'url', 'short', 'redirect',
]);

/** 前缀保留：admin-xxx、api-xxx 这类也拦截 */
export const RESERVED_PREFIXES = [
  'admin', 'api', 'www', 'mail', 'support', 'official', 'security', 'account',
  'billing', 'pay', 'dashboard', 'login', 'signin', 'verify', 'secure', 'my',
  'prain', 'yerin', 'cloudflare', 'google', 'apple', 'microsoft', 'amazon',
  'paypal', 'stripe', 'wechat', 'alipay',
];

export interface SubdomainCheck {
  ok: boolean;
  name: string;
  reason?: string;
}

/** 规范化：小写、去空格、NFKC */
export function normalizeSubdomain(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

/** 校验一个博客子域名 */
export function validateSubdomain(input: string): SubdomainCheck {
  const name = normalizeSubdomain(input);
  if (!name) return { ok: false, name, reason: '不能为空' };
  if (name.length < 3) return { ok: false, name, reason: '至少 3 个字符' };
  if (name.length > 30) return { ok: false, name, reason: '最多 30 个字符' };
  if (!/^[a-z0-9-]+$/.test(name)) return { ok: false, name, reason: '只能用小写字母、数字、短横线' };
  if (!/^[a-z0-9].*[a-z0-9]$/.test(name)) return { ok: false, name, reason: '首尾必须是字母或数字' };
  if (name.includes('--')) return { ok: false, name, reason: '不能有连续短横线' };
  if (/^\d+$/.test(name)) return { ok: false, name, reason: '不能是纯数字' };
  if (name.startsWith('xn--')) return { ok: false, name, reason: '不支持 Punycode / 非英文字符' };
  if (RESERVED_EXACT.has(name)) return { ok: false, name, reason: '这是保留名' };
  for (const p of RESERVED_PREFIXES) {
    if (name.startsWith(p + '-')) return { ok: false, name, reason: `不能以 ${p}- 开头` };
  }
  return { ok: true, name };
}

/** Host 分类：platform / tenant / reserved / unknown */
export type HostKind = 'platform' | 'tenant' | 'reserved' | 'unknown';

export interface HostInfo {
  kind: HostKind;
  host: string;
  label?: string;
}

/** 平台就是根域：example.com */
export function classifyHost(host: string, baseDomain: string): HostInfo {
  const h = String(host ?? '').toLowerCase().split(':')[0].replace(/\.$/, '');
  const base = String(baseDomain ?? '').toLowerCase();
  if (!h || !base) return { kind: 'unknown', host: h };
  if (h === base) return { kind: 'platform', host: h };
  if (!h.endsWith('.' + base)) return { kind: 'unknown', host: h };
  const label = h.slice(0, -(base.length + 1));
  if (!label || label.includes('.')) return { kind: 'unknown', host: h };
  if (RESERVED_EXACT.has(label)) return { kind: 'reserved', host: h, label };
  return { kind: 'tenant', host: h, label };
}

/** 保留名统一 302 到平台根域 */
export function platformRedirect(baseDomain: string, path = '/'): string {
  const p = path.startsWith('/') ? path : '/' + path;
  return `https://${baseDomain}${p}`;
}
