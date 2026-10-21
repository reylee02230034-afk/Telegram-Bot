# 安全检查清单 (Security Checklist)

本项目是面向本地合法服务的预约平台，安全是首要设计原则。以下清单覆盖认证、授权、数据保护、速率限制、输入校验等关键领域。

## 1. 身份认证

| # | 项目 | 状态 | 位置 |
|---|------|------|------|
| 1.1 | Telegram initData 服务端 HMAC-SHA256 验证 | ✅ | `apps/web/lib/auth.ts:verifyTelegramInitData` |
| 1.2 | initData 过期时间校验（防重放） | ✅ | `apps/web/lib/auth.ts` |
| 1.3 | JWT 使用 jose HS256 签名 | ✅ | `apps/web/lib/auth.ts` |
| 1.4 | JWT Secret ≥ 32 字符（生产环境强制） | ⚠️ 需在 .env 配置 | `.env.example:JWT_SECRET` |
| 1.5 | 敏感 Cookie 设置 httpOnly + secure + sameSite | ✅ | `apps/web/lib/auth.ts` |
| 1.6 | 不保存 Telegram 原始数据到客户端 | ✅ | 仅存 JWT |

## 2. 授权与权限

| # | 项目 | 状态 | 位置 |
|---|------|------|------|
| 2.1 | Four-tier 角色：USER / PROVIDER / ADMIN / SUPER_ADMIN | ✅ | Prisma schema |
| 2.2 | API 路由守卫拒绝未认证请求 | ✅ | `apps/web/lib/auth.ts:requireRole` |
| 2.3 | 服务者只能修改自己的资料/服务/媒体 | ✅ | 路由内验证 userId |
| 2.4 | 只有 ADMIN+ 可访问 /api/admin/* | ✅ | `requireRole(['ADMIN', 'SUPER_ADMIN'])` |
| 2.5 | Admin Telegram ID 白名单 | ✅ | `.env:ADMIN_TELEGRAM_IDS` |
| 2.6 | 普通用户不能关闭/开启他人的营业状态 | ✅ | Provider ID 归属验证 |

## 3. 数据保护

| # | 项目 | 状态 | 位置 |
|---|------|------|------|
| 3.1 | 真实精确坐标永不对客户端暴露 | ✅ | API 仅返回 geohash4 |
| 3.2 | 精确坐标仅在服务端内部用于距离计算 | ✅ | `apps/web/app/api/providers/search` |
| 3.3 | 服务者营业关闭后立即从公开列表移除 | ✅ | `isOpen=false` 排除 |
| 3.4 | 媒体文件类型校验（mime + 扩展名） | ✅ | `apps/web/app/api/media/upload` |
| 3.5 | 媒体文件大小限制（默认 10MB） | ✅ | `.env:MEDIA_MAX_SIZE_MB` |
| 3.6 | 媒体访问需验证所有权 | ✅ | 仅服务者本人可删除 |
| 3.7 | 不保存支付卡/银行账户敏感数据 | ✅ | 模拟适配器 + 网关跳转 |
| 3.8 | 密码/密钥永不明文存储 | ✅ | JWT + 环境变量 |

## 4. 速率限制 (Rate Limiting)

| # | 项目 | 状态 | 配置 |
|---|------|------|------|
| 4.1 | 登录接口限流（防暴力破解） | ✅ | `apps/web/lib/rate-limit.ts` |
| 4.2 | 预约创建限流 | ✅ | rateLimiters.booking |
| 4.3 | 媒体上传限流 | ✅ | rateLimiters.media |
| 4.4 | 举报提交限流（防骚扰） | ✅ | rateLimiters.report |
| 4.5 | 基于 IP + userId 双重限流 | ✅ | IP 和 JWT 双重标识 |

## 5. 输入校验 (Input Validation)

| # | 项目 | 状态 | 工具 |
|---|------|------|------|
| 5.1 | 所有 API POST/PUT 请求 Zod schema 校验 | ✅ | `zod` |
| 5.2 | HTML 输出转义防 XSS | ✅ | Next.js React 默认转义 |
| 5.3 | SQL 注入防护 | ✅ | Prisma 参数化查询 |
| 5.4 | 时间字段拒绝过去时间（预约） | ✅ | `.refine(v => new Date(v) > new Date())` |
| 5.5 | 字符串长度限制（防超长字段） | ✅ | Zod `.max()` 约束 |

## 6. 审计与监控

| # | 项目 | 状态 | 位置 |
|---|------|------|------|
| 6.1 | 关键操作自动审计日志（登录/预约/审核/订阅/支付） | ✅ | `apps/web/lib/audit.ts` |
| 6.2 | 审计日志记录 userId + ipAddress + 时间 | ✅ | AuditLog 模型 |
| 6.3 | 举报处理自动触发服务者暂停 | ✅ | `/api/admin/reports/[id]` |
| 6.4 | Admin 操作可追溯 | ✅ | 审计日志表 |
| 6.5 | 预留 Sentry 错误监控接入 | ⚠️ 配置 DSN 即可 | `.env:SENTRY_DSN` |

## 7. Telegram 通知安全

| # | 项目 | 状态 | 位置 |
|---|------|------|------|
| 7.1 | 通知仅发送到已认证用户的 chatId | ✅ | provider.user.telegramId |
| 7.2 | 敏感信息不在通知中暴露 | ✅ | 仅含业务必要信息 |
| 7.3 | Bot Token 不暴露给客户端 | ✅ | 服务端 fetch API |

## 8. 生产部署清单

- [ ] `JWT_SECRET` 使用密码学安全随机字符串（`openssl rand -hex 64`）
- [ ] `NODE_ENV=production`
- [ ] Docker 容器以非 root 用户运行
- [ ] PostgreSQL 设置强密码（不要使用默认 postgres/postgres）
- [ ] Redis 设置密码
- [ ] HTTPS 证书（Caddy / Nginx 反代 + Let's Encrypt）
- [ ] 配置 CSP 头（Next.js middleware 或 reverse proxy）
- [ ] 设置合理的日志轮转
- [ ] 配置数据库定期备份（至少每日）
- [ ] Sentry DSN 配置错误监控
- [ ] SMTP 配置邮件通知
- [ ] 真实支付网关接入（移除 mock）

## 9. 应急响应

| 场景 | 行动 |
|------|------|
| 服务者违规 | Admin → Reports → resolve（自动暂停）或手动设置 `approvalStatus=REJECTED` |
| 用户恶意举报 | Admin → Reports → dismiss，可对用户设置 role=USER 限制 |
| 支付故障 | 设置 `PAYMENT_GATEWAY=mock` 临时恢复，通知用户稍后重试 |
| 数据库异常 | 最近备份恢复 + 联系 DBA |
| 安全漏洞 | 紧急 `docker compose down web` 停服，推送紧急修复后 `up -d --build` |
