interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS: Fetcher;
  PRAIN_ENV?: string;
  SESSION_SECRET?: string;
  /** 平台根域，如 example.com */
  BASE_DOMAIN?: string;
  /** 平台总管理面板密码 */
  OPS_PASSWORD?: string;
  /** Cloudflare 账号 ID（额度统计用） */
  CF_ACCOUNT_ID?: string;
  /** 只读 Analytics API Token（额度统计用） */
  CF_ANALYTICS_TOKEN?: string;
  /** 演示站后台解锁密钥（设置后 /admin 与 /ops 对访客返回 404） */
  DEMO_ADMIN_KEY?: string;
  /** 平台名称 */
  PLATFORM_NAME?: string;
  /** 当前请求所属站点（由 app.ts 按 Host 注入，不要写进 wrangler.toml） */
  SITE?: string;
}

declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*.sql' {
  const content: string;
  export default content;
}
