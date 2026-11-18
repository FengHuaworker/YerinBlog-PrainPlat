# Security Policy

## 报告问题

请不要在公开 issue 里贴可利用细节、账号信息或用户数据。
通过仓库所有者的邮箱或私信报告，附上复现步骤与影响范围。

## 部署注意事项

- `wrangler.prod.toml`、`.dev.vars`、`.wrangler/`、`node_modules/` 已在 `.gitignore` 中，不要提交。
- 生产环境必须设置：
  - `SESSION_SECRET`：32 位以上随机串；否则会自动生成并写入 KV（可用，但多地域冷启动时可能短暂不一致）。
  - `OPS_PASSWORD`：`/ops` 运维密码，不要用示例值。
- 运维令牌包含密码指纹，修改 `OPS_PASSWORD` 后旧会话立即失效。

## 已知设计

- 博客后台密码沿用 Prain 的 **md5** 哈希，以兼容旧数据；新部署建议自行替换为更强哈希（`src/lib/session.ts` 与 `src/routes/admin.ts` 的校验点）。
- 评论输出已做 HTML 转义；文章内容按作者意图渲染 HTML/fk，属于后台可信内容。
- 上传文件存放在 KV，按站点前缀隔离；SVG 直接访问时返回 `Content-Security-Policy: default-src 'none'`。
- 平台不存储支付信息，也没有第三方追踪脚本。
