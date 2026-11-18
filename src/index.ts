/**
 * Prain 清雨博客 · Cloudflare Workers 入口
 * 原版：https://prain.cn （PHP 1.3.4）
 */

import { handleRequest } from './app';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
