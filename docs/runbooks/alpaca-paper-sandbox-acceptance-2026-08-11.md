# Alpaca Paper 沙盒验收记录（2026-08-11）

## 环境与安全边界

- 仅连接 `https://paper-api.alpaca.markets`。
- 凭据由被 Git 和 Docker 构建上下文忽略的本机 `.env` 提供。
- 验收未访问 Live Trading，也未使用真实资金。

## 已通过

- 真实只读 smoke：Alpaca 行情、Finnhub、FRED、Alpaca Paper 共 4 项执行，0 项跳过。
- 账户、SPY 资产、未完成订单与账户活动读取成功。
- 应用订单预览、确认、Outbox 发布和真实 Worker 提交成功。
- 1 股 AAPL 非可成交限价单远端进入 `new`，随后应用撤单收敛为 `canceled`。
- 独立 WebSocket 实际收到该订单的 `pending_new`、`new`、`canceled` 更新。
- 为在常规交易时段外验证成交恢复，暂停 Worker 后用应用生成的同一 `client_order_id` 提交扩展时段 Paper 限价单；Worker 重启后绑定既有远端订单，没有重复提交。
- AAPL 买入和卖出各 1 股均收敛为 `filled`；WebSocket 两次均收到 `pending_new`、`new`、`fill`。
- REST 全量对账成功，买卖活动进入隔离 Paper 账本；最终 AAPL 持仓为 0、未完成订单为 0、活动漂移为 0。
- Worker 心跳为 `ready`，队列延迟为 0。

## 验收过程中修复

- `readme_work.md` 被排除出 Docker 构建上下文，防止本机凭据进入构建缓存。
- 运行镜像复制服务端实际导入的 `src/` 模块。
- 需要外部供应商访问的 Worker 同时连接 outbound 与 backend 网络。
- Trade Updates 收到合法 `listening` 确认后保持健康状态。

## 尚未观测

两次真实成交都从 `new` 直接进入 `fill`，未产生 `partial_fill`。Alpaca Paper 文档说明，可成交订单只有约 10% 会随机获得一次部分成交，因此该状态无法由沙盒 API 确定性触发。确定性的部分成交、撤单竞态、账本和绩效联动已由 fixture-backed E2E 覆盖；真实沙盒部分成交仍需在后续自然发生时补充证据，不能标记为已通过。
