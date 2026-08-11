# Alpaca Paper 对账运行手册

## 安全边界

- 只连接 `https://paper-api.alpaca.markets`，禁止替换为 Live Trading 地址。
- 不直接编辑 `broker.ledger_event`、订单投影、成交或活动行；账本必须由 Alpaca 的不可变远端 ID 重放。
- 漂移期间停止确认新订单，先保留现场并运行全量对账。

## 健康检查

```powershell
docker compose --profile paper-trading ps web-api trading-worker postgres redis
docker compose exec trading-worker npm run worker:health -- trading
Invoke-RestMethod http://127.0.0.1:8787/api/v1/broker/alpaca-paper/status
```

Trade Updates 断开时，worker 会按有上限的指数退避重连；REST 订单对账仍每 30 秒运行，账户、持仓和活动每 5 分钟运行。流降级本身不授权重提订单。

## 检查待收敛订单与漂移

```powershell
docker compose exec postgres psql -U stock_m -d stock_m -c "select order_intent_id,state,version,updated_at from broker.order_projection where state in ('pending_submission','reconciling','accepted','new','partially_filled','cancel_pending') order by updated_at;"
docker compose exec postgres psql -U stock_m -d stock_m -c "select cash_difference,symbol_differences_json,detected_at from broker.drift where cleared_at is null order by detected_at desc;"
```

`reconciling` 表示提交结果不确定。系统只按确定性 `client_order_id` 查询 Alpaca；查到远端订单后绑定，明确未找到前绝不再次提交。

## 手工触发全量对账

在组合页切换到 “Alpaca Paper”，点击“重新对账”。该操作只写入 Outbox，由 `trading-worker` 执行，不会在 Web 请求中直接访问券商。等待一个完整周期后复查漂移。只有后续一次完整、成功且差额为零的对账才能清除漂移。

若漂移持续存在，保存账户、持仓、活动、订单时间线和 worker 日志，检查遗漏活动或供应商数据延迟；不要用 SQL 修改历史来让数字表面一致。
