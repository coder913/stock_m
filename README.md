# stock_m

面向美股研究与模拟决策的本地工作台。生产页面统一通过本机 Fastify 网关读取行情、公司资料、财务数据、新闻和事件；浏览器不会接触供应商密钥，也不会发送真实订单。

## 快速开始

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

在 `.env` 中配置需要启用的数据源：

- [Alpaca](https://app.alpaca.markets/signup)：行情、K 线、新闻和公司行为。
- [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)：财务事实和监管文件；`SEC_USER_AGENT` 必须包含可联系的邮箱。
- [Finnhub](https://finnhub.io/register)：公司资料和财报日历。
- [FRED](https://fred.stlouisfed.org/docs/api/api_key.html)：宏观序列和发布事件；页面保留 FRED 归属说明。

供应商凭据只在服务端读取。不要把 `.env`、密钥或账户资料提交到 Git。

## 验证

```powershell
npm test
npm run build
npm run test:e2e
npm run test:data:smoke
```

只运行投资逻辑监控浏览器流程：

```powershell
npm run test:e2e -- tests/e2e/thesis-monitoring.spec.ts
```

`npm run test:e2e` 会先构建生产前端，再启动 fixture-backed Fastify 服务器。该服务器注册与生产相同的 `/api/*` 路由，但使用确定性的 Alpaca、SEC、Finnhub 和 FRED fixture providers，因此浏览器测试不依赖外网或实时价格。

测试服务器额外提供一次性故障注入接口：

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:4173/api/testing/fail-next `
  -ContentType application/json `
  -Body '{"source":"alpaca","code":429}'
```

下一次对应供应商请求会返回模拟的 `429` 或 `503`，用于验证冷却、最后成功缓存和部分供应商失败。该路由只存在于 E2E 服务器，不会注册到生产服务。

E2E 服务器还提供 `POST /api/testing/market-state`，可确定性修改某只 fixture 股票的价格和前收盘价。该接口会推进测试时钟使一分钟报价缓存过期，只用于验证监控状态迁移，不会注册到生产服务。

`npm run test:data:smoke` 仅检查已配置真实供应商的认证、响应结构、来源和时间戳，不断言固定价格或事件数量。Playwright 使用本机安装的稳定版 Chrome。

## 缓存与失败降级

本地缓存位于 `.data/stock-m-cache.sqlite`。仅校验成功的数据可以覆盖最后成功值。

| 数据 | TTL |
| --- | ---: |
| 市场状态、报价、分钟 K 线 | 1 分钟 |
| 日 K 线 | 15 分钟 |
| 新闻 | 10 分钟 |
| 财报和公司行为事件 | 6 小时 |
| 公司资料、财务、文件、宏观序列和 FRED 发布日历 | 24 小时 |

手动刷新通过 `POST /api/cache/refresh` 完成。供应商返回 429 时会进入冷却；已有缓存时继续显示最后成功数据，并明确标记刷新失败或数据陈旧。备份或删除 `.data` 前请先停止服务。

## 数据边界

- 默认股票池约 100 只高流动性美股与 ETF，不代表全市场扫描。
- Alpaca IEX/延迟数据会展示实际来源和延迟，不描述为全市场实时行情。
- 新闻仅保存并展示元数据、摘要和原文链接，不复制文章正文。
- 缺失值保持缺失，不自动替换为零。
- 投资逻辑、模拟账本、提醒和周度复盘保存在浏览器本地。

## 投资逻辑监控

研究页可为每个不可变投资逻辑版本添加结构化指标或事件条件。条件、评估历史、提醒和人工复核分别保存在以下浏览器本地版本库：

- `stock_m:thesis-conditions:v1`
- `stock_m:condition-evaluations:v1`
- `stock_m:monitor-alerts:v1`
- `stock_m:thesis-reviews:v1`

条件状态包括“待验证、成立、受损、已过期”。只有 fresh 且字段完整的数据可以改变成立/受损结论；stale、missing 或 unavailable 会显示“等待新数据”，并保留上一次 fresh 的有效结论，不产生错误的受损或恢复提醒。

监控在 Today、研究页和组合页首次加载、用户点击“刷新监控”，或市场数据手动刷新成功后运行。当前版本没有服务端定时任务、后台监控、邮件或浏览器系统通知；应用关闭时不会继续评估。

自动评估只读取每只股票最新投资逻辑版本的条件；旧版本保留为历史，归档当前逻辑会停止继续评估。研究页可用“基于当前条件新建版本”复制条件并生成新的条件 ID，原版本不会被改写。若本地监控记录中存在损坏项，Research、Today 与 Portfolio 会保留有效记录并显示非阻断恢复提示。

Today 展示需要复核的提醒，支持已读、稍后处理、归档和跳转研究页；`/monitor` 提供待处理、稍后处理、已归档视图、筛选和完整时间线。条件由系统确定性评估，但整条投资逻辑只能由用户标记为“仍成立、已失效、已归档”。“已失效”只更新健康展示，绝不会自动卖出持仓或创建订单。

详细设计与实施记录见 `docs/superpowers/specs/2026-08-07-live-market-data-design.md`、`docs/superpowers/plans/2026-08-07-live-market-data.md`、`docs/superpowers/specs/2026-08-09-thesis-monitoring-design.md` 和 `docs/superpowers/plans/2026-08-09-thesis-monitoring.md`。
