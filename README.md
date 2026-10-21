# 本地服务预约平台 (Local Service Booking)

基于 Telegram Bot + Telegram Mini App 的附近合法本地服务预约平台。支持服务者注册、媒体展示、营业状态管理、地图/列表双视图、预约管理、订阅计费、后台审核和投诉处理。

## 技术栈

| 组件 | 技术 |
|------|------|
| Web 应用 | Next.js 15 (App Router), React 18, TypeScript |
| Bot | grammY (Telegram Bot API) |
| 认证 | Telegram initData 验证 + JWT |
| 数据库 | PostgreSQL 15 + Prisma ORM |
| 缓存/限流 | Redis 7 |
| 地图 | Leaflet + OpenStreetMap（坐标模糊化） |
| 样式 | Tailwind CSS 4 |
| 校验 | Zod |
| 容器化 | Docker Compose |

## 架构

```
┌─────────────────┐     Webhook/轮询     ┌──────────────┐
│  Telegram Bot   │ ──────────────────►  │  grammy Bot  │
│  (用户入口)     │ ◄────────────────── │  (apps/bot)  │
└────────┬────────┘    sendMessage API  └──────┬───────┘
         │                                       │
         │  打开 Mini App                        │  直接 DB 操作
         ▼                                       ▼
┌─────────────────┐     HTTPS            ┌──────────────────┐
│  Next.js Web   │ ◄──────────────────► │  PostgreSQL      │
│  (apps/web)    │  Prisma ORM          │  + Redis         │
└─────────────────┘                     └──────────────────┘
```

### 目录结构

```
├── apps/
│   ├── web/                    # Next.js Mini App (端口 3000)
│   │   ├── app/api/            # API 路由
│   │   │   ├── auth/           # Telegram initData 登录
│   │   │   ├── providers/      # 服务者 CRUD + 搜索
│   │   │   ├── bookings/       # 预约创建/查询
│   │   │   ├── subscriptions/  # 订阅计划/变更
│   │   │   ├── admin/          # 后台管理（审核/举报/日志）
│   │   │   ├── media/          # 媒体上传
│   │   │   └── reports/        # 举报提交
│   │   ├── lib/                # 共享库 (auth/prisma/rate-limit/audit)
│   │   └── components/         # UI 组件 (MapView 等)
│   └── bot/                    # Telegram Bot
├── prisma/                     # Schema + Migrations
├── docker/                     # Dockerfile.web + Dockerfile.bot
├── docker-compose.yml          # 编排 postgres/redis/web/bot
└── .env.example
```

### API 清单

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | /api/auth/login | Telegram initData 登录 | 公开 |
| GET  | /api/auth/me | 当前用户信息 | JWT |
| GET  | /api/providers/search | 搜索附近服务者（支持距离/分类/价格筛选） | 公开 |
| GET  | /api/providers/:id | 服务者详情（模糊坐标） | 公开 |
| POST | /api/providers/:id/toggle-open | 切换营业状态 | PROVIDER |
| POST | /api/bookings | 创建预约 | USER/PROVIDER |
| GET  | /api/bookings/mine | 我的预约列表 | 任意登录 |
| GET  | /api/bookings/:id | 预约详情 | 相关用户 |
| POST | /api/subscriptions | 变更订阅（含支付） | PROVIDER |
| GET  | /api/subscriptions | 查询当前订阅 | PROVIDER |
| GET  | /api/subscriptions/plans | 订阅计划列表 | 公开 |
| POST | /api/media/upload | 媒体上传 | 任意登录 |
| POST | /api/reports | 提交举报 | 任意登录 |
| GET  | /api/admin/providers | 服务者审核列表 | ADMIN+ |
| POST | /api/admin/providers/:id/:action | 审核 approve/reject | ADMIN+ |
| GET  | /api/admin/reports | 举报列表 | ADMIN+ |
| POST | /api/admin/reports/:id | 处理举报 resolve/dismiss | ADMIN+ |
| GET  | /api/admin/audit-logs | 审计日志 | ADMIN+ |

### 数据模型

核心模型：User → Provider → Service → Booking → BookingItem，订阅通过 SubscriptionPlan + 关联 User 实现，举报/审计独立。所有坐标存储精确值但 API 返回 geohash4（约 5km 精度）实现模糊化。

## 快速开始

### 1. 环境要求

- Node.js 20+
- Docker + Docker Compose
- PostgreSQL 15+（可选，Docker 会自动启动）

### 2. 安装依赖

```bash
cd <项目根>
npm install
cp .env.example .env
# 编辑 .env 填入 TELEGRAM_BOT_TOKEN 和 ADMIN_TELEGRAM_IDS
```

### 3. 启动数据库

```bash
docker compose up -d postgres redis
# 等待 healthy...
```

### 4. 数据库初始化

```bash
npx prisma generate
npx prisma db push          # 开发环境 schema 同步
npx prisma db seed           # 初始化分类/订阅计划/测试数据
```

### 5. 开发模式

```bash
npm run dev                  # 同时启动 web (3000) + bot
# 或分别启动
npm run dev:web              # Next.js http://localhost:3000
npm run dev:bot              # grammy polling
```

### 6. 生产部署（Docker）

```bash
docker compose up -d --build
# 容器自动启动 web + bot + postgres + redis
```

### 7. 运行测试

```bash
node test_e2e.js             # 端到端测试（当前 39/39 通过）
npm run build                # 生产构建验证
```

## 部署说明

### Telegram Bot 配置

1. 在 BotFather 创建 Bot，获取 Token
2. 设置 Bot Commands：`/start`, `/help`, `/map`, `/list`, `/bookings`, `/register`
3. 在 BotFather → Web App Settings 中配置 Mini App URL 域名
4. 可选：配置 Webhook 模式（需公网 HTTPS）

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| DATABASE_URL | ✅ | PostgreSQL 连接串 |
| REDIS_URL | ✅ | Redis 连接串 |
| TELEGRAM_BOT_TOKEN | ✅ | BotFather 提供 |
| JWT_SECRET | ✅ | 至少 32 字符随机字符串 |
| NEXT_PUBLIC_APP_URL | ✅ | 公网可访问的 Web 地址 |
| ADMIN_TELEGRAM_IDS | ✅ | 管理员 Telegram ID 逗号分隔 |
| PAYMENT_GATEWAY | ❌ | `mock`（默认）/ `wechat` / `alipay` |
| NODE_ENV | ✅ | `production` 或 `development` |

### 真实支付网关接入

当前使用模拟支付适配器（apps/web/lib/payment.ts）。切换真实网关：
1. 在环境变量设置 `PAYMENT_GATEWAY=wechat` 或 `alipay`
2. 配置相应商户 ID 和密钥（不保存卡号，仅做支付链接跳转/回调）
3. 在 payment.ts 中按网关 API 实现实际支付调用

### 备份恢复

```bash
# 备份
docker compose exec postgres pg_dump -U postgres local_service > backup_$(date +%Y%m%d).sql

# 恢复
cat backup_20261020.sql | docker compose exec -T postgres psql -U postgres local_service
```

## 回滚方案

| 场景 | 回滚步骤 |
|------|----------|
| Web 构建失败 | `docker compose down web && docker compose up -d --no-build web`（保持旧镜像） |
| Schema 变更破坏 | PostgreSQL 备份恢复 + `prisma db push` 回到上一版本 |
| 误操作封禁 | Admin 面板 → Reports → dismiss 或直接更新 Provider.approvalStatus |
| 支付故障 | 设置 `PAYMENT_GATEWAY=mock` 恢复模拟，排查真实网关问题 |

## 验收清单

- [x] Telegram initData 服务端验证
- [x] JWT 认证 + 角色权限（USER / PROVIDER / ADMIN / SUPER_ADMIN）
- [x] 速率限制（创建预约/上传媒体/提交举报）
- [x] Zod 输入校验
- [x] 审计日志（关键操作自动记录）
- [x] 模糊位置（geohash4，约 5km 精度）
- [x] 营业状态主动控制，关闭立即从列表/地图移除
- [x] 服务者资料仅展示明确授权公开的字段
- [x] 媒体上传（类型/大小/安全校验）
- [x] 订阅计费（免费/基础/旗舰三档）
- [x] 模拟支付适配器，支持真实网关切换
- [x] 预约创建 Telegram Bot 通知推送
- [x] 举报 + 后台处理（resolve 自动暂停对应服务者）
- [x] 后台审核服务者 approve/reject
- [x] 生产构建无错误
- [x] 39/39 端到端测试通过
- [ ] 真实支付网关接入（需商户资质）
- [ ] Bot Webhook 模式（需公网域名）
- [ ] Sentry 错误监控接入
- [ ] 邮件通知配置（SMTP）

## 安全注意事项

详细安全检查清单见 [SECURITY.md](./SECURITY.md)。核心原则：
- 绝不公开真实精确坐标
- 绝不保存支付卡敏感数据
- 所有写操作需认证 + 速率限制
- Admin 操作自动审计记录
- 内容安全校验在媒体上传时执行

## 许可证

内部项目，未经授权不得商用。
