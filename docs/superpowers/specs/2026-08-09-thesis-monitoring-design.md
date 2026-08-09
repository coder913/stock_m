# stock_m 投资逻辑监控设计规格

**日期：** 2026-08-09  
**状态：** 已确认  
**阶段目标：** 在现有实时数据、研究、组合与事件平台之上，建立可解释、可追溯、由用户最终确认的投资逻辑监控闭环。

## 1. 背景

当前版本已经具备真实行情、公司资料、SEC 财务与文件、新闻、公司行为、宏观事件、发现页筛选、研究页、模拟组合和周度复盘。现有投资逻辑可以保存，但验证条件仍是自由文本，系统无法持续回答以下问题：

- 哪一条支持逻辑已经得到新数据确认；
- 哪一条风险条件已经触发；
- 哪些条件因为数据陈旧或缺失而无法判断；
- 用户是否已经复核过本次变化；
- 同一变化是否已经提醒，避免重复打扰。

本阶段将验证条件结构化，并在浏览器内使用确定性规则评估，形成“条件定义 → 数据快照 → 状态变化 → 应用内提醒 → 人工复核”的闭环。

## 2. 目标

- 允许用户为每个投资逻辑版本创建结构化指标条件和日期事件条件。
- 使用现有 `/api/*` 数据合同评估条件，不在浏览器中直接调用供应商。
- 对每次有效评估保存数据来源、数据时间、实际值、目标值和解释。
- 仅在状态发生变化时生成可去重的应用内提醒。
- 在 Today、研究页、组合页和独立提醒中心呈现一致的监控状态。
- 条件状态由系统计算，整条投资逻辑是否仍成立由用户确认。
- 缺失、陈旧或不可用数据不得错误判坏投资逻辑。

## 3. 非目标

- 不使用自然语言或 AI 自动解析验证条件。
- 不监控新闻关键词或进行新闻情绪判断。
- 不发送邮件、浏览器系统通知、短信或移动推送。
- 不增加服务端定时任务、后台队列或云端同步。
- 不自动确认整条投资逻辑失效。
- 不自动创建、撤销或调整任何真实或模拟订单。
- 不改变当前供应商、缓存、模拟账本和周度复盘的数据所有权。

## 4. 核心原则

- **确定性：** 相同条件与相同数据快照必须得到相同结果。
- **人工最终确认：** 软件提示证据变化，不替用户做投资决定。
- **数据质量优先：** 只有新鲜、完整、可解释的数据才能改变条件结论。
- **版本不可变：** 条件绑定投资逻辑版本；修改逻辑时创建新版本，不改写历史。
- **状态迁移提醒：** 稳态不重复提醒，只有迁移产生新提醒。
- **本地优先：** 条件、历史、提醒和复核记录继续保存在浏览器 localStorage。

## 5. 架构选择

采用浏览器内确定性监控。

Fastify 继续只提供实时数据、缓存和失败降级。浏览器通过 `MarketApiClient` 获取报价、发现页指标和事件快照，在本地运行纯函数规则引擎。打开 Today、研究页或组合页以及用户手动刷新时触发评估。

该方案与当前单用户、本地应用和应用内提醒目标一致。应用关闭时不评估；首版没有离线通知，因此不需要引入服务端调度、条件同步或多端冲突处理。未来需要离线提醒时，可保持条件与结果合同不变，将编排迁移到服务端。

## 6. 模块边界

### 6.1 条件仓库

`conditionRepository` 负责：

- 保存条件、逻辑状态和用户复核记录；
- 按投资逻辑版本和股票代码读取；
- 使用软删除保留历史；
- 执行 localStorage 版本迁移；
- 不访问市场数据，不执行条件评估。

建议存储键：

```text
stock_m:thesis-conditions:v1
stock_m:thesis-reviews:v1
```

### 6.2 监控快照加载器

`monitorSnapshotLoader` 负责：

- 将一批待评估条件按股票和资源类型分组；
- 通过一个 `MarketApiClient` 读取批量报价、`/api/discovery/universe` 和 `/api/events`；
- 生成与 React 页面无关的 `MonitorSnapshot`；
- 保留每个字段的来源、`asOf`、`stale` 和 notices；
- 不判定条件状态，不写提醒仓库。

### 6.3 条件规则引擎

`conditionEvaluator` 是纯函数，负责：

- 解析指标与事件条件；
- 应用比较符、方向和截止日期语义；
- 输出状态、数据质量、实际值、目标值和解释；
- 不读写 localStorage，不发请求，不产生提醒副作用。

### 6.4 提醒仓库

`monitorAlertRepository` 负责：

- 保存提醒、已读状态、稍后处理时间和归档时间；
- 使用确定性去重键防止同一状态迁移重复提醒；
- 提供待处理、稍后处理和已归档查询；
- 不重新计算条件。

建议存储键：

```text
stock_m:monitor-alerts:v1
stock_m:condition-evaluations:v1
```

### 6.5 监控服务

`thesisMonitorService` 负责：

- 读取当前有效条件；
- 请求监控快照；
- 调用规则引擎；
- 保存有效评估结果和状态迁移；
- 生成去重提醒；
- 向页面返回统一摘要；
- 不修改模拟组合，不自动改变整条投资逻辑的人工状态。

## 7. 领域模型

```ts
type ConditionKind = "metric" | "event";
type ConditionDirection = "support" | "risk";
type ConditionSeverity = "low" | "medium" | "high";
type ConditionStatus = "pending" | "confirmed" | "breached" | "expired";
type EvaluationDataState = "fresh" | "missing" | "stale" | "unavailable";
type ThesisDecisionStatus = "active" | "reaffirmed" | "invalidated" | "archived";
type ThesisHealthStatus = "normal" | "review-needed" | "invalidated" | "archived" | "unmonitored";

interface BaseCondition {
  id: string;
  symbol: string;
  thesisVersionId: string;
  name: string;
  direction: ConditionDirection;
  severity: ConditionSeverity;
  deadline?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface MetricCondition extends BaseCondition {
  kind: "metric";
  metric: MonitorMetric;
  operator: ">" | ">=" | "<" | "<=" | "between";
  target: number | readonly [number, number];
  period: "CURRENT" | "MRQ" | "TTM";
}

interface EventCondition extends BaseCondition {
  kind: "event";
  eventType: "earnings" | "dividend" | "split" | "corporate-action" | "macro";
  occurrence: "before-date" | "within-range" | "not-occurred-by-date";
  from?: string;
  to: string;
}

type ThesisCondition = MetricCondition | EventCondition;

interface ConditionEvaluation {
  id: string;
  conditionId: string;
  conditionVersion: string;
  status: ConditionStatus;
  dataState: EvaluationDataState;
  actualValue?: number | string;
  targetValue?: number | readonly [number, number] | string;
  source?: "alpaca" | "sec" | "finnhub" | "fred" | "composite";
  asOf?: string;
  explanation: string;
  evaluatedAt: string;
}

interface MonitorAlert {
  id: string;
  dedupeKey: string;
  symbol: string;
  thesisVersionId: string;
  conditionId: string;
  fromStatus?: ConditionStatus;
  toStatus: ConditionStatus;
  severity: ConditionSeverity;
  title: string;
  explanation: string;
  createdAt: string;
  readAt?: string;
  snoozedUntil?: string;
  archivedAt?: string;
}
```

`conditionVersion` 是条件规范化 JSON 的稳定哈希。提醒去重键使用：

```text
thesisVersionId + ":" + conditionId + ":" + conditionVersion + ":" + toStatus + ":" + asOf
```

## 8. 首版指标与事件目录

指标目录只包含当前免费数据股票池可提供的字段：

- `price`
- `dailyChangePercent`
- `revenueGrowthYoY`
- `operatingMargin`
- `freeCashFlow`
- `freeCashFlowYield`
- `netDebtToEbitda`
- `earningsSurprise`
- `grossMarginYoYChange`
- `priceVs20DayHigh`
- `relativeVolume`
- `averageDollarVolume20d`

事件目录：

- 财报；
- 分红；
- 拆股；
- 其他公司行为；
- FRED 宏观发布。

已保存的旧自由文本验证条件继续显示，但标记为“未结构化，不参与自动监控”。系统不猜测或自动转换旧文本。

## 9. 判定语义

### 9.1 指标条件

规则引擎先计算比较结果 `matched`：

- `>`、`>=`、`<`、`<=` 按数值直接比较；
- `between` 包含上下边界，且要求目标为升序二元组；
- 实际值或目标缺失时不比较。

然后根据方向映射状态：

| 方向 | matched | 状态 |
| --- | --- | --- |
| support | true | confirmed |
| support | false | breached |
| risk | true | breached |
| risk | false | confirmed |

### 9.2 事件条件

- `before-date`：在 `to` 当日结束前出现匹配事件即 matched。
- `within-range`：在闭区间 `[from, to]` 出现匹配事件即 matched；`from` 必填。
- `not-occurred-by-date`：`to` 到达前保持 pending；截止 `to` 仍没有出现匹配事件时 matched。
- `before-date` 和 `within-range` 在窗口结束前没有事件时保持 pending；窗口结束后没有事件时 unmatched。
- 股票事件必须匹配条件 symbol；宏观事件不要求 symbol。
- 事件日期按 ISO 8601 的市场日期部分比较；界面展示本地时间，不改变日期判定。

### 9.3 截止日期与数据质量

- 条件尚无可判断数据时为 `pending`。
- 到达 deadline 后仍没有可判断数据时为 `expired`。
- `stale`、`missing` 或 `unavailable` 快照不得覆盖上一次 fresh 的有效结论。
- 对不可判断评估保存数据质量说明，但不产生 `breached` 或恢复提醒。
- 新鲜数据重新可用后，从上一次有效结论继续比较状态迁移。

## 10. 投资逻辑整体状态

系统持久化的人工决策状态是 `active`、`reaffirmed`、`invalidated` 或 `archived`。页面另行派生 `ThesisHealthStatus`，不会把派生健康状态写回人工决策。

系统按以下规则派生 `review-needed`：

- 任一高严重度条件 `breached`；
- 任一条件 `expired`；
- 两个及以上中严重度条件 `breached`；

满足任一规则时，监控摘要显示 `review-needed`。这不是人工状态写入，不会自动把逻辑改为 `invalidated`。

用户可以执行：

- `reaffirmed`：已复核，逻辑仍成立；
- `invalidated`：已复核，逻辑失效；
- `archived`：停止跟踪。

每次人工操作必须保存时间、逻辑版本、备注和当时的条件摘要。

`reaffirmed` 表示用户已经处理复核快照中记录的风险。派生健康状态恢复为 `normal`，并在当前受损/过期条件集合与复核快照保持一致时维持该状态；新增风险、条件版本变化或条件状态变化会再次派生 `review-needed`。这一规则只影响派生健康状态，不会改写条件评估历史。

## 11. 评估触发与幂等

评估在以下时机触发：

- Today 首次加载；
- 研究页首次加载；
- 组合页首次加载；
- 用户点击“刷新监控”；
- 页面市场数据手动刷新成功。

一次应用会话内，相同 `conditionVersion` 和相同资源 `asOf` 只评估一次。刷新失败可以更新数据质量说明，但不创建新的状态提醒。

状态迁移提醒包括：

- `pending → confirmed`
- `pending → breached`
- `pending → expired`
- `confirmed → breached`
- `breached → confirmed`
- `expired → confirmed`
- `expired → breached`

初次批量导入条件时，`pending → confirmed` 默认写入历史但不进入 Today；其他迁移进入提醒中心。

## 12. 页面设计

### 12.1 研究页

在投资逻辑编辑区下方新增“验证条件”：

- 支持逻辑与风险逻辑分组；
- 指标条件编辑器包含指标、比较符、目标值、周期、严重程度和截止日期；
- 事件条件编辑器包含事件类型、发生语义、日期范围、严重程度和备注；
- 保存投资逻辑时同时生成不可变条件版本；
- 条件卡展示状态、实际值、目标值、来源、数据时间、质量和解释；
- 提供“立即评估”和“确认复核”。

### 12.2 Today

新增“需要复核”区：

- 高严重度受损条件优先；
- 其次为过期、中严重度受损、即将到期和数据不可用；
- 每项支持已读、稍后处理、归档和跳转研究页；
- 普通稳态 confirmed 不显示。

### 12.3 组合页

- 顶部显示受损条件数、即将到期数和未读提醒数；
- 每个持仓显示“正常、需要复核、已失效、无监控条件”；
- 点击进入研究页，不在组合页重复编辑条件；
- invalidated 只改变展示，不自动卖出。

### 12.4 提醒中心

新增 `/monitor`：

- “待处理、稍后处理、已归档”三个视图；
- 按股票、严重程度、状态变化和日期筛选；
- 展示条件状态时间线和人工复核记录；
- 支持将整条投资逻辑确认成 reaffirmed、invalidated 或 archived。

## 13. 错误处理

- 条件格式无效：阻止保存，错误定位到具体字段。
- 股票池不支持指标：保留条件但标记 missing，不自动改写条件。
- API 失败且没有缓存：显示 unavailable，保留上次有效结论。
- API 返回旧缓存：显示 stale，保留上次有效结论。
- localStorage 损坏：隔离损坏记录，其他条件继续可用，并显示恢复提示。
- 提醒写入失败：评估结果仍可展示，但显示“提醒未保存”，允许重试。
- 逻辑版本不存在：条件归档，不迁移到其他版本。
- 同一提醒重复写入：按 dedupeKey 返回已有记录，不创建副本。

## 14. 测试策略

### 14.1 规则引擎

使用表格测试覆盖：

- 五种比较符和边界值；
- support/risk 方向反转；
- 指标缺失、陈旧、不可用和过期；
- 三种事件发生语义；
- 市场日期与本地展示时区分离；
- 上次有效状态保留。

### 14.2 仓库与服务

- v1 存储读写和损坏记录隔离；
- 条件软删除与不可变版本；
- 状态迁移历史；
- 提醒去重、已读、稍后处理和归档；
- 相同条件版本与数据时间的幂等评估；
- 多股票快照批量加载和部分 API 失败。

### 14.3 React 交互

- 新建指标和事件条件；
- 字段校验与取消编辑；
- 立即评估和错误重试；
- 人工 reaffirmed/invalidated；
- Today 提醒处理；
- 组合健康摘要与研究页跳转；
- 提醒中心筛选与状态时间线。

### 14.4 Chrome E2E

Fixture-backed 流程：

1. 在 NVDA 研究页保存投资逻辑和风险条件；
2. 首次评估为 confirmed；
3. 通过测试 API 切换 fixture 数据，使风险条件触发；
4. 刷新监控后生成一条 breached 提醒；
5. Today 显示需要复核；
6. 研究页保存 reaffirmed 复核；
7. 组合页健康摘要更新；
8. 重复刷新不产生重复提醒；
9. 注入供应商失败时保留上次有效结论。

## 15. 验收标准

- 用户可以在研究页创建、编辑、软删除并版本化结构化条件。
- 所有首版指标与事件条件均有明确、可重复的判定结果。
- 每个结果显示实际值、目标值、来源、数据时间和解释。
- stale、missing 和 unavailable 不会把条件错误改成 breached。
- 只有状态迁移产生提醒，相同迁移不会重复。
- Today、研究页、组合页和 `/monitor` 对同一条件显示一致状态。
- 用户可以完成已读、稍后处理、归档和整条逻辑人工复核。
- 人工 invalidated 不自动修改持仓或创建订单。
- 现有投资逻辑、模拟账本、周度复盘和市场数据测试继续通过。
- 完整 Vitest、TypeScript/Vite 构建、稳定 Chrome E2E、构建产物密钥扫描和生产 mock 扫描通过。

## 16. 实施分期

### 里程碑一：规则与持久化

- 条件领域类型、校验与版本化仓库；
- 指标和事件规则引擎；
- 评估历史与提醒仓库；
- 快照加载器与监控服务。

### 里程碑二：交互闭环

- 研究页条件编辑和评估状态；
- Today 需要复核区；
- 组合健康摘要；
- `/monitor` 提醒中心；
- Fixture-backed 状态切换和完整 Chrome E2E。

## 17. 后续扩展边界

以下扩展必须保持当前领域合同兼容，并单独设计：

- 浏览器系统通知、邮件或移动推送；
- 服务端定时评估与离线提醒；
- 自然语言条件解析；
- 新闻关键词与语义证据；
- 云端同步与多设备冲突处理；
- 与 Alpaca 模拟订单或真实订单联动。
