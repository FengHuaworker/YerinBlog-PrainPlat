/** 扩展钩子：读取已安装扩展的 hooks 片段 */

import { BUILTIN_EXT_CONF } from './store';
import { siteOf } from './db';
import { AnyObj } from './util';

export async function buildHooks(env: Env, conf: AnyObj): Promise<Record<string, string>> {
  const hooks: Record<string, string> = {};
  const enabled = conf.ext || {};
  const rows = await env.DB.prepare('SELECT id, conf FROM pkg WHERE site = ?1 AND type = ?2').bind(siteOf(env), 'ext').all<{ id: string; conf: string }>();

  const manifests = new Map<string, any>();
  for (const row of rows.results || []) {
    try {
      manifests.set(row.id, JSON.parse(row.conf));
    } catch {
      // ignore
    }
  }
  for (const [id, confObj] of Object.entries(BUILTIN_EXT_CONF)) {
    if (!manifests.has(id)) manifests.set(id, confObj);
  }
  for (const [id, manifest] of manifests) {
    if (!enabled[id]) continue;
    const h = manifest?.hooks;
    if (!h || typeof h !== 'object') continue;
    for (const [name, html] of Object.entries(h)) {
      if (typeof html !== 'string') continue;
      hooks[name] = (hooks[name] || '') + html;
    }
  }
  return hooks;
}
