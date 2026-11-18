/** Worker 今日请求额度（Cloudflare GraphQL Analytics，结果缓存 10 分钟） */

export interface QuotaInfo {
  available: boolean;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  at: number;
  error?: string;
}

const LIMIT = 100000;
const CACHE_KEY = 'platform:quota:v1';
const CACHE_TTL = 600;

function empty(error?: string): QuotaInfo {
  return { available: false, used: 0, limit: LIMIT, remaining: LIMIT, percent: 0, at: 0, error };
}

function utcDayStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().replace('.000Z', 'Z');
}

async function fetchUsage(env: Env): Promise<number | null> {
  const token = env.CF_ANALYTICS_TOKEN;
  const account = env.CF_ACCOUNT_ID;
  if (!token || !account) return null;

  const query = `query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$s}){sum{requests}}}}}`;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: account, s: utcDayStart() } }),
  });
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(rows)) return null;
  let total = 0;
  for (const r of rows) total += Number(r?.sum?.requests || 0);
  return Math.round(total);
}

export async function getQuota(env: Env): Promise<QuotaInfo> {
  const now = Math.floor(Date.now() / 1000);
  let cached: any = null;
  try {
    cached = await env.KV.get(CACHE_KEY, 'json');
  } catch {
    cached = null;
  }
  if (cached && cached.at && now - cached.at < CACHE_TTL) {
    const used = Number(cached.used) || 0;
    return {
      available: true,
      used,
      limit: LIMIT,
      remaining: Math.max(0, LIMIT - used),
      percent: Math.min(100, Number(((used / LIMIT) * 100).toFixed(2))),
      at: cached.at,
    };
  }

  const used = await fetchUsage(env);
  if (used === null) {
    if (cached && cached.at) {
      const u = Number(cached.used) || 0;
      return {
        available: true,
        used: u,
        limit: LIMIT,
        remaining: Math.max(0, LIMIT - u),
        percent: Math.min(100, Number(((u / LIMIT) * 100).toFixed(2))),
        at: cached.at,
      };
    }
    return empty(env.CF_ANALYTICS_TOKEN ? '查询失败' : '未配置 Analytics Token');
  }

  try {
    await env.KV.put(CACHE_KEY, JSON.stringify({ used, at: now }), { expirationTtl: 1800 });
  } catch {
    // 缓存失败不影响展示
  }
  return {
    available: true,
    used,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - used),
    percent: Math.min(100, Number(((used / LIMIT) * 100).toFixed(2))),
    at: now,
  };
}
