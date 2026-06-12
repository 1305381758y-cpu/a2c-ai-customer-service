# 线上部署说明：Docker / VPS

如果不用 Render，可以把本项目部署到任意 Linux 云服务器。推荐用 Docker Compose 启动服务，再用 Nginx/Caddy/宝塔反向代理到域名 HTTPS。

## 服务器要求

- Ubuntu/Debian/CentOS 等 Linux 服务器。
- 已安装 Docker 和 Docker Compose。
- 一个可解析到服务器 IP 的域名。
- 服务器防火墙开放 `80`、`443`，如直接测试也可临时开放 `3000`。

## 上传代码

把项目上传到服务器，例如：

```bash
git clone 你的仓库地址 a2c-ai-customer-service
cd a2c-ai-customer-service
```

如果不用 Git，也可以把整个项目目录上传到服务器。

## 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
PORT=3000
DATABASE_URL=/app/data/app.db
INTERNAL_API_KEY=请改成随机强密码

A2C_BASE_URL=https://openapi.a2c.chat/api/openapi
A2C_APP_ID=A2C开放平台App ID
A2C_APP_SECRET=A2C开放平台App Secret

GOOGLE_AI_API_KEY=Google AI Studio API Key
GOOGLE_AI_MODEL=gemini-2.5-flash

TELEGRAM_BOT_TOKEN=Telegram机器人Token
TELEGRAM_HANDOFF_CHAT_ID=人工接管群ID

PLATFORM_REGISTER_URL=平台开户链接
TG_REGISTER_GUIDE_URL=Telegram注册说明链接
```

## 启动服务

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

应返回：

```json
{"ok":true}
```

SQLite 数据保存在服务器项目目录的 `./data/app.db`，容器重启不会丢失。

## 配置域名 HTTPS

把域名反向代理到：

```text
http://127.0.0.1:3000
```

如果使用 Caddy，可参考：

```caddyfile
你的域名 {
  reverse_proxy 127.0.0.1:3000
}
```

如果使用 Nginx，可参考：

```nginx
server {
  listen 80;
  server_name 你的域名;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

建议使用宝塔、Nginx Proxy Manager 或 Caddy 自动签发 HTTPS 证书。

## 配置 A2C Webhook

线上域名配置完成后，在 A2C 后台填写：

```text
https://你的域名/webhooks/a2c
```

## 上传训练样本

```bash
curl -X POST https://你的域名/internal/training-samples/import \
  -H "X-API-Key: 你的INTERNAL_API_KEY" \
  -F "file=@samples/training-samples-template.csv"
```

## 常用运维命令

重启：

```bash
docker compose restart
```

更新代码后重新部署：

```bash
git pull
docker compose up -d --build
```

备份数据库：

```bash
cp data/app.db data/app-$(date +%F-%H%M%S).db
```
