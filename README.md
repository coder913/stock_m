# stock_m

面向美股研究与模拟决策的本地工作台。生产页面统一通过本机 Fastify 网关读取行情、公司资料、财务数据、新闻和事件；浏览器不会接触供应商密钥，也不会发送真实订单。

## 快速开始

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d --build
```

应用只发布到 `http://127.0.0.1:8787`。PostgreSQL 和 Redis 仅位于 Compose 内部网络，不向宿主机暴露端口。开发模式可在已启动 `docker-compose.test.yml` 基础服务后运行 `npm run dev`。

在 `.env` 中配置需要启用的数据源：

- [Alpaca](https://app.alpaca.markets/signup)：行情、K 线、新闻和公司行为。
- [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)：财务事实和监管文件；`SEC_USER_AGENT` 必须包含可联系的邮箱。
- [Finnhub](https://finnhub.io/register)：公司资料和财报日历。
- [FRED](https://fred.stlouisfed.org/docs/api/api_key.html)：宏观序列和发布事件；页面保留 FRED 归属说明。

供应商凭据只在服务端读取。不要把 `.env`、密钥或账户资料提交到 Git。

`.env` 还必须设置 `POSTGRES_PASSWORD` 和至少 32 位的 `INTERNAL_SERVICE_TOKEN`。`DATABASE_URL`、`REDIS_URL` 供非 Compose 开发或运维命令使用；Compose 会为 `web-api` 生成内部连接地址。

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

只运行组合绩效浏览器流程：

```powershell
npm run test:e2e -- tests/e2e/portfolio-performance.spec.ts
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

行情缓存位于 PostgreSQL 的 `market` schema。仅校验成功的数据可以覆盖最后成功值；并发刷新使用 `fetched_at` 比较更新，较旧响应不会覆盖较新缓存。供应商冷却与刷新审计也由 PostgreSQL 共享。

| 数据 | TTL |
| --- | ---: |
| 市场状态、报价、分钟 K 线 | 1 分钟 |
| 日 K 线 | 15 分钟 |
| 新闻 | 10 分钟 |
| 财报和公司行为事件 | 6 小时 |
| 公司资料、财务、文件、宏观序列和 FRED 发布日历 | 24 小时 |

手动刷新通过 `POST /api/cache/refresh` 完成。供应商返回 429 时会进入冷却；已有缓存时继续显示最后成功数据，并明确标记刷新失败或数据陈旧。

## 数据边界

- 默认股票池约 100 只高流动性美股与 ETF，不代表全市场扫描。
- Alpaca IEX/延迟数据会展示实际来源和延迟，不描述为全市场实时行情。
- 新闻仅保存并展示元数据、摘要和原文链接，不复制文章正文。
- 缺失值保持缺失，不自动替换为零。
- 投资逻辑、监控状态、模拟账本、提醒和周度复盘只写入本机 PostgreSQL；生产页面统一通过 `/api/v1` 仓储访问。

## 组合绩效分析

组合页的“绩效分析”从不可变账本和历史日线重建每日净值，支持成立以来、YTD、1 年、6 个月、3 个月和自定义区间。默认基准是 SPY，也可选择 QQQ、DIA、IWM 或有至少两个有效日线点的自定义股票/ETF。

旧版本浏览器数据使用以下版本键，迁移完成后仅作为只读备份保留：

- `stock_m:portfolio-ledger:v1`：买入、卖出、分红、费用、入金、出金和已确认拆股。
- `stock_m:portfolio-settings:v1`：初始资金、成立日期、USD 基础货币和比较基准。
- `stock_m:ignored-splits:v1`：用户明确忽略并填写备注的拆股候选。
- `stock_m:portfolio-performance-cache:v1`：最多 10 条可重新生成的派生绩效结果。

迁移向导会先生成包含有效记录、隔离记录和 SHA-256 的本地备份，再将组合设置与不可变账本一次性导入 PostgreSQL。正常运行时不再向这些业务键写入；`stock_m:portfolio-performance-cache:v1` 仍是可重建的浏览器派生缓存。

### 计算口径

- 初始资金和 `deposit` 是外部流入，`withdrawal` 是外部流出；买卖、分红、费用和拆股不是外部现金流。
- 日收益采用 Modified Dietz，按现金流真实发生时间计算区间权重；TWR 链接连续有效日收益。
- MWR 使用 XIRR。投资者视角下期初资产和入金为负，出金与期末资产为正；现金流没有正负两种符号或 100 次迭代内不收敛时只隐藏 MWR。
- 持仓历史请求 `adjustment=raw`，由已确认拆股账本事件调整数量；基准请求 `adjustment=all`，并在连续区间起点归一化为 100。
- 建仓日缺少收盘价时可临时使用当日买入价。已有持仓最多沿用最近 5 个估值日收盘价并标记 stale，第 6 个缺失日开始为 unavailable，绝不按零估值。
- unavailable 会在图表中形成断点；摘要只计算最后一段连续有效区间，不跨断点链接收益或回撤。
- 连续有效历史少于 30 个自然日时不显示年化收益。
- 日收益贡献容差为 `1e-10`，几何链接 TWR 贡献容差为 `1e-8`，金额盈亏容差为 `0.01 USD`。任一对账失败都会隐藏贡献排名并显示诊断。
- 未确认且发生在持仓期间的拆股会阻断生效日后的绩效。用户可修改供应商预填比例后确认、填写备注后忽略，或手动补录；同一 `sourceEventId` 不会重复写入。

当前版本不包含真实券商下单、云端账户同步、税务批次、Brinson 归因、期权、多币种、多组合或应用关闭后的后台计算。

## 投资逻辑监控

研究页可为每个不可变投资逻辑版本添加结构化指标或事件条件。条件、评估历史、提醒和人工复核保存在 PostgreSQL；以下旧浏览器键只供一次性迁移和下载备份使用：

- `stock_m:thesis-conditions:v1`
- `stock_m:condition-evaluations:v1`
- `stock_m:monitor-alerts:v1`
- `stock_m:thesis-reviews:v1`

条件状态包括“待验证、成立、受损、已过期”。只有 fresh 且字段完整的数据可以改变成立/受损结论；stale、missing 或 unavailable 会显示“等待新数据”，并保留上一次 fresh 的有效结论，不产生错误的受损或恢复提醒。

当前里程碑完成了监控数据的服务端持久化，但还没有服务端定时任务、后台监控、邮件或浏览器系统通知；这些属于下一阶段。

自动评估只读取每只股票最新投资逻辑版本的条件；旧版本保留为历史，归档当前逻辑会停止继续评估。研究页可用“基于当前条件新建版本”复制条件并生成新的条件 ID，原版本不会被改写。若本地监控记录中存在损坏项，Research、Today 与 Portfolio 会保留有效记录并显示非阻断恢复提示。

Today 展示需要复核的提醒，支持已读、稍后处理、归档和跳转研究页；`/monitor` 提供待处理、稍后处理、已归档视图、筛选和完整时间线。条件由系统确定性评估，但整条投资逻辑只能由用户标记为“仍成立、已失效、已归档”。“已失效”只更新健康展示，绝不会自动卖出持仓或创建订单。

详细设计与实施记录见 `docs/superpowers/specs/2026-08-07-live-market-data-design.md`、`docs/superpowers/plans/2026-08-07-live-market-data.md`、`docs/superpowers/specs/2026-08-09-thesis-monitoring-design.md` 和 `docs/superpowers/plans/2026-08-09-thesis-monitoring.md`。

## 服务健康与恢复

健康端点不返回数据库连接串、令牌或供应商密钥：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health/live
Invoke-RestMethod http://127.0.0.1:8787/api/health/ready
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

`live` 只表示进程可响应；`ready` 要求 PostgreSQL 可用并包含当前迁移版本。Redis 故障单独报告为 `degraded`：同步业务写入仍可提交，Outbox 会在 Redis 恢复后继续发布。Compose 的持久卷是 `stock_m_postgres-data` 与 `stock_m_redis-data`（实际前缀随 Compose project name 变化）。SIGTERM 会先停止接收请求、停止 Outbox 发布并排空进行中的请求，再关闭队列、Redis 与数据库连接；20 秒超时会非零退出，Compose 提供 25 秒停止宽限期。

创建和校验备份：

```powershell
.\scripts\backup.ps1
.\scripts\verify-backup.ps1 -DumpPath .\backups\stock-m-YYYYMMDDTHHMMSSZ.dump
```

备份使用 PostgreSQL custom format，并生成同名 `.manifest.json`，其中包含应用版本、数据库迁移版本、UTC 创建时间与 SHA-256。恢复会先校验哈希，将备份恢复到临时数据库，执行应用迁移 check-only 和完整性查询，全部通过后才交换数据库名称；旧数据库保留为带时间戳的回滚副本。

恢复前必须停止 API 和所有 worker，且必须显式重复目标数据库名：

```powershell
docker compose stop web-api
.\scripts\restore.ps1 -DumpPath .\backups\stock-m-YYYYMMDDTHHMMSSZ.dump -ConfirmDatabaseName stock_m
docker compose start web-api
```

未来加入 worker 服务后也要先停止 `monitor-worker`、`notification-worker` 和 `trading-worker`。恢复脚本会再次检查 API 与这些 worker 均未运行。浏览器迁移源键不会被清除或覆盖，始终作为只读恢复来源保留。
