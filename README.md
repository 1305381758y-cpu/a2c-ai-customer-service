# A2C AI Customer Service

当前版本实现多商户、可配置话本流程、客户上下文理解、模拟训练和可观测的大模型调用。

核心运行原则：话本流程决定下一步，AI 只负责意图理解和自然表达；模拟训练不会调用 A2C 或 Telegram；所有资源按商户、国家、客服账号和会话隔离。

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Main APIs

- `POST /internal/training-samples/import` 上传 Excel/CSV 样本，需 `X-API-Key`。
- `GET /internal/training-samples` 查询样本，需 `X-API-Key`。
- `PATCH /internal/training-samples/:id` 修改、启用、停用样本，需 `X-API-Key`。
- `GET /internal/conversations` 查询客户会话，需 `X-API-Key`。
- `GET /internal/conversations/:id/messages` 查询会话消息，需 `X-API-Key`。
- `POST /webhooks/a2c` 接收 A2C Webhook。
- `GET /health` 健康检查。
 - `/` 前端管理系统入口，默认管理员由 `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` 配置。

AI 供应商默认使用 MiniMax，也支持 DeepSeek 和 Gemini。供应商、模型和密钥可在商户设置中单独配置；调用失败会记录任务类型、供应商、模型、HTTP 状态、结束原因和响应摘要，客户侧使用规则兜底，不会因为模型异常中断流程。

样本推荐字段：

```csv
客户消息,标准回复,适用阶段,客户意图,语言,关键词,优先级,是否启用
我要怎么注册,请点击注册链接完成账号注册,need_platform_register,ask_platform_register,zh,注册 链接,10,是
```

完整交付和验收说明见 [docs/甲方交付说明.md](docs/甲方交付说明.md)。

线上部署说明见 [docs/线上部署说明-Render.md](docs/线上部署说明-Render.md)。

VPS/Docker 部署说明见 [docs/线上部署说明-Docker-VPS.md](docs/线上部署说明-Docker-VPS.md)。
