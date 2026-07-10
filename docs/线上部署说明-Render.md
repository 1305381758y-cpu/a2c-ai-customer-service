# 线上部署说明：Render

本项目是长期运行的 A2C Webhook 后端服务，推荐部署为 Render Web Service，并挂载 Persistent Disk 保存 SQLite 数据库。

## 为什么用 Render Web Service

- A2C Webhook 需要稳定公网 HTTPS 地址。
- 服务需要长期运行，收到消息后立即处理。
- SQLite 数据库需要持久化磁盘，不能放在临时文件系统。
- Render Blueprint 支持用仓库里的 `render.yaml` 一键创建服务。

## 部署前准备

1. 把本项目推送到 GitHub/GitLab/Bitbucket。
2. 注册或登录 Render。
3. 在 Render 连接代码仓库。
4. 使用仓库根目录的 `render.yaml` 创建 Blueprint。

Render 会创建：

- 一个 Node.js Web Service。
- 一个 1GB 持久化磁盘，挂载到 `/var/data`。
- 数据库路径：`/var/data/app.db`。

## 必填环境变量

Render 创建 Blueprint 时，需要手动填写以下 `sync: false` 的变量：

```bash
INTERNAL_API_KEY=后台接口密钥，建议随机强密码
SESSION_SECRET=登录会话密钥，建议随机强密码
DEFAULT_ADMIN_EMAIL=默认平台管理员邮箱
DEFAULT_ADMIN_PASSWORD=默认平台管理员密码，至少8位
A2C_APP_ID=A2C开放平台App ID
A2C_APP_SECRET=A2C开放平台App Secret
GOOGLE_AI_API_KEY=Google AI Studio API Key（兼容供应商，可为空）
MINIMAX_API_KEY=MiniMax Open Platform API Key（使用 MiniMax 时填写）
DEEPSEEK_API_KEY=DeepSeek API Key（使用 DeepSeek 时填写）
TELEGRAM_BOT_TOKEN=Telegram机器人Token
TELEGRAM_HANDOFF_CHAT_ID=人工接管群ID
PLATFORM_REGISTER_URL=甲方平台开户链接
TG_REGISTER_GUIDE_URL=Telegram注册说明链接，可为空
```

已默认配置：

```bash
NODE_VERSION=24.14.1
DATABASE_URL=/var/data/app.db
A2C_BASE_URL=https://openapi.a2c.chat/api/openapi
GOOGLE_AI_MODEL=gemini-2.5-flash
MINIMAX_MODEL=MiniMax-M3
DEEPSEEK_MODEL=deepseek-chat
```

系统默认供应商为 MiniMax。商户后台可以按商户选择 MiniMax、DeepSeek 或 Gemini；平台环境变量只用于补充默认配置，商户自己的配置优先。模型调用失败时会记录供应商、任务类型、HTTP 状态、结束原因和响应摘要，客户消息仍会保留并走规则兜底。

## A2C Webhook 地址

部署成功后，Render 会给出服务域名，例如：

```text
https://a2c-ai-customer-service.onrender.com
```

在 A2C 后台配置 Webhook：

```text
https://a2c-ai-customer-service.onrender.com/webhooks/a2c
```

## 线上验收

健康检查：

```bash
curl https://你的Render域名/health
```

应返回：

```json
{"ok":true}
```

上传训练样本：

```bash
curl -X POST https://你的Render域名/internal/training-samples/import \
  -H "X-API-Key: 你的INTERNAL_API_KEY" \
  -F "file=@samples/training-samples-template.csv"
```

查询样本：

```bash
curl "https://你的Render域名/internal/training-samples?enabled=true" \
  -H "X-API-Key: 你的INTERNAL_API_KEY"
```

查询客户会话：

```bash
curl "https://你的Render域名/internal/conversations?limit=20" \
  -H "X-API-Key: 你的INTERNAL_API_KEY"
```

## 注意事项

- 不要使用免费无磁盘环境保存 SQLite 数据；重启会丢数据。
- Render Persistent Disk 需要付费服务计划。
- `INTERNAL_API_KEY` 不要发给普通客服，只给系统管理员。
- A2C、Google AI Studio、Telegram 的密钥都只填写在 Render 环境变量，不要写进代码仓库。
- 首次发布后，先导入样本，再打开 A2C Webhook。
