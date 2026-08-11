# 交易 Worker 可靠性设计

## 目标

交易 Worker 必须在 BullMQ 重复投递、Alpaca Trade Updates 断线和进程退出时保持可预测：成功处理的命令只消费一次，外部连接状态反映到 heartbeat，所有后台任务与连接都能被等待和关闭。

## Worker 生命周期契约

`runWorker.initialize` 兼容原有的处理函数返回值，并新增生命周期对象：

```ts
{
  process(job): Promise<unknown>;
  healthy(): boolean;
  close(): Promise<void>;
}
```

- `healthy` 与 BullMQ Worker 自身状态共同决定 heartbeat：全部健康为 `ready`，任一异常为 `degraded`，恢复后回到 `ready`。
- `close` 在通用运行时关闭 BullMQ、Redis 和数据库之前执行。
- 关闭过程只执行一次，顺序为停止后台来源、等待当前 BullMQ Job、关闭队列连接和数据库。

## Inbox 去重

- 交易 Job 以 `trading-worker` 为 consumer、BullMQ Job ID（缺失时使用消息 event ID）为 event ID。
- 每个 Job 在数据库事务内调用既有 `consumeOnce`；已成功记录的重复投递不再调用命令服务。
- 命令抛错时事务回滚，BullMQ 重试仍能再次处理。
- 不支持的 Job 保持 `UnrecoverableError`，不写入 Inbox。

订单提交仍依赖确定性 `clientOrderId` 和服务端状态机抵御“券商成功、数据库提交失败”这种跨系统不确定性；Inbox 负责消除平台内部的明确重复投递。

## Trade Updates 与定时任务

- WebSocket 初始为不健康；完成 Alpaca 鉴权或收到有效更新后转为健康。
- `error`、`close` 和消息处理失败立即转为不健康；成功重连后恢复。
- 保存重连 timer，`stop` 时清除，阻止关闭后重连。
- `stop` 幂等关闭当前 socket，并等待 close 完成。
- 30 秒订单对账和 5 分钟全量对账由一个生命周期控制器管理；捕获异步错误并将组件标为不健康，下一次成功后恢复。
- 关闭时清除两个 interval，并等待正在执行的对账 Promise 与 Trade Updates 停止完成。

## 测试

- 单元测试验证相同 Job 只调用命令一次、失败后允许重试、不支持 Job 不占用 Inbox。
- Worker runtime 测试验证生命周期健康状态参与 heartbeat，且 `close` 仅执行一次并处于资源关闭顺序之前。
- Trade Updates 测试验证健康变化、重连 timer 清理和幂等停止。
- 生命周期测试验证两个定时器被清理并等待活动对账。
