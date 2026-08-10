# 组合绩效与基准分析设计

**日期：** 2026-08-10
**状态：** 已确认
**阶段目标：** 在现有不可变模拟账本、实时市场数据和周度复盘之上，建立可回算、可对账、可解释的组合绩效与基准比较能力。

## 1. 背景

当前版本已经可以记录买入、卖出、分红和费用，计算当前持仓、现金、累计盈亏、行业暴露、集中度和简单回撤，并将组合快照写入周报。但当前组合分析仍存在以下缺口：

- 初始资金固定为 `10,000 USD`；
- 账本不能表达入金、出金和拆股；
- 回撤使用固定演示历史，而不是真实每日净值；
- 无法区分资金变化与投资收益；
- 没有 TWR、MWR/XIRR、基准收益和超额收益；
- 无法解释个股、分红和费用分别贡献了多少收益；
- 历史行情缺失时无法给出可信的可用区间。

本阶段将新增“绩效分析”标签。市场数据仍由 Fastify 和供应商适配器负责，用户组合数据和分析引擎继续保留在浏览器本地。

## 2. 目标

- 支持可配置初始资金与组合成立日期。
- 支持入金、出金和经用户确认的拆股账本事件。
- 从第一笔账本事件或组合成立日起，根据历史日线回算每日持仓、现金和净值。
- 默认与 `SPY` 比较，并支持 `QQQ`、`DIA`、`IWM` 和自定义美股/ETF 基准。
- 计算区间 TWR、MWR/XIRR、年化收益、当前回撤、最大回撤和上涨日占比。
- 计算组合、个股、分红和费用贡献，并保证金额与收益贡献可以对账。
- 对 stale、部分缺失、停牌、拆股待确认和 XIRR 不收敛提供明确状态。
- 保持现有账本、投资逻辑监控和周度复盘行为兼容。

## 3. 非目标

首期不包含：

- 多组合管理；
- Brinson 行业配置/选股效应；
- 税务批次、FIFO、LIFO 或特定批次成本；
- 期权、做空、融资融券和杠杆；
- 外汇换算和多币种组合；
- 真实券商同步或真实下单；
- 账户、云端同步或服务端组合持久化；
- 服务端定时快照、邮件或系统通知；
- 对现金补偿、并购、分拆上市等复杂公司行为自动记账。

## 4. 核心原则

- **账本不可变：** 所有资金、交易、分红、费用和拆股调整都追加为事件，不改写历史事件。
- **现金流与收益分离：** 入金和出金只改变资本规模，不计为投资收益。
- **不伪造精度：** 任一必要价格缺失时不把持仓按零估值，也不跨 unavailable 区间连线。
- **可对账：** 金额盈亏必须与期末资产变化一致；收益贡献之和必须与 TWR 一致。
- **用户确认公司行为：** 供应商公司行为只预填拆股事件，用户确认后才改变持仓数量。
- **本地优先：** 账本、设置和派生分析缓存继续保存在浏览器本地。
- **纯函数计算：** 历史回算、收益和归因不依赖 React 或 localStorage，便于确定性测试。

## 5. 架构选择

采用“服务端历史行情 + 浏览器本地分析引擎”。

Fastify 负责：

- 批量读取 Alpaca 历史日线；
- 处理分页、调整模式、SQLite 缓存、429 和旧缓存降级；
- 标准化拆股公司行为候选；
- 返回统一 `DataEnvelope`。

浏览器负责：

- 保存组合设置和不可变账本；
- 请求持仓股票与基准日线；
- 应用资金、交易、分红、费用和拆股事件；
- 计算每日净值、收益、回撤、基准和归因；
- 缓存派生结果并展示数据质量。

本阶段不建立服务端组合分析 API，也不向服务端上传用户账本。

## 6. 模块边界

### 6.1 批量历史行情

服务端新增批量日线读取能力：

```ts
type BarsAdjustment = "raw" | "split" | "dividend" | "all";

interface BatchPriceBars {
  symbols: Record<string, PriceBar[]>;
  missingSymbols: string[];
}
```

HTTP 合同：

```text
GET /api/market/bars?symbols=NVDA,MSFT&timeframe=1Day&start=2025-01-01&end=2026-08-10&adjustment=raw
```

规则：

- `symbols` 去重、转大写，至少 1 个，最多 100 个；
- `timeframe` 本阶段批量接口只接受 `1Day`；
- `start` 和 `end` 接受 `YYYY-MM-DD` 或 RFC 3339，且 `start <= end`；
- `adjustment` 必须为四个允许值之一；
- 服务端必须遍历所有 `next_page_token`；
- 单个代码没有日线时写入 `missingSymbols`，不让其他代码失败；
- 现有单股票 `/api/market/bars/:symbol` 保持兼容。

持仓股票请求 `adjustment=raw`。基准请求 `adjustment=all`，使基准曲线包含拆股和现金分红调整。Alpaca 官方批量历史日线接口支持这些调整模式，默认模式为 `raw`，并要求调用方处理分页。[Alpaca Historical Bars](https://docs.alpaca.markets/us/v1.4.2/reference/stockbars)

### 6.2 拆股候选

统一市场事件扩展可选拆股详情：

```ts
interface SplitEventDetails {
  oldRate: number;
  newRate: number;
  quantityMultiplier: number;
  effectiveDate: string;
}

interface MarketEvent {
  // 现有字段保持不变
  split?: SplitEventDetails;
}
```

`quantityMultiplier = newRate / oldRate`。只有 `type === "split"` 可以携带 `split`。若供应商只返回拆股类型和日期而没有有效比例，仍返回候选事件，但不生成 `split` 详情，界面要求用户补齐。

Alpaca 公司行为接口支持 `forward_split` 和 `reverse_split` 类型；本应用只自动预填这两类。[Alpaca Corporate Actions](https://docs.alpaca.markets/us/v1.1/reference/corporateactions-1)

### 6.3 组合设置仓库

```ts
interface PortfolioSettings {
  version: 1;
  initialCash: number;
  inceptionDate: string;
  benchmarkSymbol: string;
  baseCurrency: "USD";
  updatedAt: string;
}
```

`PortfolioSettingsRepository` 提供：

```ts
get(): PortfolioSettings;
save(input: Omit<PortfolioSettings, "version" | "updatedAt">, now?: string): PortfolioSettings;
migrate(events: LedgerEvent[], now?: string): PortfolioSettings;
```

校验规则：

- `initialCash` 必须是大于或等于零的有限数；
- `inceptionDate` 必须是有效 `YYYY-MM-DD`，不得晚于最早账本事件的纽约市场日期，也不得晚于今天；
- `benchmarkSymbol` 必须匹配 `^[A-Z0-9.-]+$`；
- 保存前对基准转大写；
- 有账本事件后修改初始资金或成立日期必须先展示重算影响并由用户确认。

迁移规则：

- 已有设置时不重复迁移；
- 默认 `initialCash = 10_000`；
- 有账本事件时，`inceptionDate` 取最早事件的纽约市场日期；
- 没有账本事件时，`inceptionDate` 取迁移当天；
- 默认 `benchmarkSymbol = "SPY"`；
- `baseCurrency` 固定为 `USD`。

### 6.4 账本扩展

```ts
type LedgerEventType =
  | "buy"
  | "sell"
  | "dividend"
  | "fee"
  | "deposit"
  | "withdrawal"
  | "split";

interface SplitLedgerFields {
  symbol: string;
  oldRate: number;
  newRate: number;
  quantityMultiplier: number;
  source: "alpaca" | "manual";
  sourceEventId: string;
  confirmedAt: string;
}
```

规则：

- `deposit` 和 `withdrawal` 必须有正数 `amount` 和非空 `reason`；
- `withdrawal` 不得使当时现金为负；
- `split` 必须有股票、正数比率、生效时间和确认时间；
- 同一 `sourceEventId` 只能追加一次；
- 正向或反向拆股将数量乘以 `quantityMultiplier`，每股成本除以该倍数，总成本不变；
- 拆股生效日先应用拆股，再应用当日其他账本事件；
- 反向拆股小数股保留最多 8 位；不自动生成现金补偿。

### 6.5 历史加载器

`PerformanceHistoryLoader`：

1. 读取组合设置和完整账本；
2. 收集历史上曾持有的所有股票；
3. 将查询起点设为组合成立日与最早账本事件日期中的较早者；
4. 批量请求持仓股票 `raw` 日线；
5. 单独请求基准 `all` 日线；
6. 请求持仓期间拆股候选；
7. 返回行情、数据质量、缺失代码和未确认拆股。

加载器不执行收益计算，也不写账本。

### 6.6 绩效引擎

```ts
interface DailyPortfolioPoint {
  marketDate: string;
  valuedAt: string;
  cash: number;
  holdingsValue?: number;
  totalValue?: number;
  externalFlow: number;
  dailyReturn?: number;
  cumulativeTwr?: number;
  benchmarkValue?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  dataState: "fresh" | "stale" | "unavailable";
  missingSymbols: string[];
}

interface PerformanceSummary {
  from: string;
  to: string;
  availableFrom?: string;
  twr?: number;
  mwr?: number;
  annualizedReturn?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  currentDrawdown?: number;
  maximumDrawdown?: number;
  positiveDayRate?: number;
}
```

`PortfolioPerformanceEngine` 是纯函数：

```ts
calculate(input: PerformanceInput): PerformanceResult;
```

它不访问网络、Storage、系统时间或随机数。

### 6.7 归因引擎

```ts
interface ContributionItem {
  key: string;
  symbol?: string;
  label: string;
  moneyContribution: number;
  returnContribution?: number;
  realizedPnl: number;
  unrealizedPnl: number;
  dividends: number;
  fees: number;
}

interface AttributionResult {
  items: ContributionItem[];
  totalMoneyPnl: number;
  totalReturnContribution?: number;
  reconciled: boolean;
  diagnostic?: string;
}
```

`PerformanceAttribution` 只消费绩效引擎产生的日度中间结果，不重新读取账本或行情。

### 6.8 分析缓存

`PerformanceCacheRepository` 的缓存键由以下字段组成：

- 账本内容哈希；
- 设置内容哈希；
- 持仓行情 `asOf`；
- 基准行情 `asOf`；
- 查询起止日期；
- 基准代码；
- 绩效算法版本。

缓存只保存派生结果。缓存损坏时隔离记录并重新计算，不影响账本和设置。

## 7. 历史回算语义

### 7.1 市场日期

- 日线的 `startedAt` 映射为其纽约市场日期；
- 账本事件按 `occurredAt` 映射到纽约市场日期；
- 估值点使用持仓或基准日线出现过的有效美国交易日；
- 非交易日不生成独立净值点；
- 非交易日发生的外部现金流归入下一个估值子期间，但 XIRR 保留真实时间。

### 7.2 每日事件顺序

每个交易日按以下顺序处理：

1. 读取上一有效交易日收盘后的现金和持仓；
2. 应用当日已确认拆股；
3. 按 `occurredAt` 处理入金和出金；
4. 按 `occurredAt` 处理买入和卖出；
5. 处理分红和费用；
6. 用当日收盘价估值；
7. 计算日收益、回撤和贡献。

同一时间戳按账本追加顺序处理。

### 7.3 价格缺口

- 股票在建仓当日没有收盘价时，可用该日最后一笔买入价格完成当日估值，并标记 `stale`；
- 已持仓股票暂时没有新日线时，最多沿用最近 5 个交易日的收盘价，并标记 `stale`；
- 连续超过 5 个交易日没有价格时，该日 `totalValue` 为 `undefined`，状态为 `unavailable`；
- 不把缺失持仓价格设为零；
- 恢复价格后可以继续生成新的有效区间，但不跨 unavailable 区间计算单一连续 TWR。

### 7.4 未确认拆股

若持仓期间存在未确认拆股候选：

- 拆股生效日前的历史仍可计算；
- 从生效日开始的净值和绩效标记为 `unavailable`；
- 用户确认并追加拆股事件后清除对应阻断并重新计算；
- 用户拒绝候选时保存忽略记录和备注，避免每次加载重复询问；
- 手动拆股使用 `sourceEventId = manual:<uuid>`。

## 8. 收益计算口径

### 8.1 外部现金流

- 初始资金是组合成立时的初始资本；
- `deposit` 是正外部流入；
- `withdrawal` 是负外部流入；
- 买入、卖出、分红、费用和拆股都不是外部现金流。

### 8.2 日度 Modified Dietz

相邻两个有效估值时点之间：

```text
dailyReturn = (endingValue - beginningValue - sum(flows))
              / (beginningValue + sum(weight_i * flow_i))
```

`weight_i` 为现金流发生后到本期结束的时间占整个估值子期间的比例，限制在 `[0, 1]`。开始时点使用上一交易日 `valuedAt`，结束时点使用当日 `valuedAt`。分母小于或等于零时，该日收益不可计算。

### 8.3 TWR

连续有效区间的累计 TWR：

```text
TWR = product(1 + dailyReturn_t) - 1
```

用户选择的区间跨越 unavailable 断点时：

- 图表保留断点；
- 摘要只对最后一段连续有效区间计算；
- 明确显示 `availableFrom`；
- 不把多段收益直接相乘。

### 8.4 MWR/XIRR

投资者视角现金流：

- 初始资金和入金为负；
- 出金为正；
- 区间结束资产为正；
- 区间开始时已有资产作为负的期初投资。

使用真实 ISO 时间求解年化 XIRR。若现金流没有至少一个正值和一个负值，或数值算法在 100 次迭代内不收敛，`mwr` 为 `undefined`，其他指标继续计算。

### 8.5 基准与超额收益

- 默认基准为 `SPY`；
- 预设基准包括 `QQQ`、`DIA` 和 `IWM`；
- 自定义基准必须通过股票代码校验且至少返回两个有效日线点；
- 基准使用 `adjustment=all` 的收盘价；
- 区间起点归一化为 100；
- `excessReturn = portfolioTwr - benchmarkReturn`；
- 自定义基准失败时不覆盖已保存默认基准。

### 8.6 年化、回撤和上涨日占比

- 有效历史少于 30 个自然日时不显示年化收益；
- 年化收益使用实际自然日数；
- 回撤基于有效净值点的历史峰值；
- unavailable 断点之后重新建立峰值，不跨断点计算最大回撤；
- `positiveDayRate` 是有效且非零收益日中 `dailyReturn > 0` 的比例；没有非零收益日时不显示。

## 9. 归因与对账

### 9.1 日度金额贡献

股票当日经济盈亏：

```text
symbolPnl = endingMarketValue
            - beginningMarketValue
            - buyCashPaid
            + sellCashReceived
```

分红作为对应股票的独立正贡献。费用作为组合级独立负贡献。外部现金流贡献恒为零。

### 9.2 日度收益贡献

```text
dailyContribution_i = dailyEconomicPnl_i / modifiedDietzDenominator
```

所有日度贡献必须满足：

```text
sum(dailyContribution_i) = dailyReturn
```

允许的浮点误差为 `1e-10`。

### 9.3 几何链接

区间贡献使用向后几何链接：

```text
linkedContribution_i = sum(
  dailyContribution_i,t * product(1 + dailyReturn_u), for u > t
)
```

所有区间贡献必须满足：

```text
sum(linkedContribution_i) = TWR
```

允许的浮点误差为 `1e-8`。

### 9.4 金额对账

```text
totalMoneyPnl = endingValue
                - beginningValue
                - deposits
                + withdrawals
```

并且：

```text
totalMoneyPnl = sum(symbol price/trading pnl)
                + dividends
                - fees
```

允许的金额误差为 `0.01 USD`。任一对账失败时不展示贡献排名，改为显示诊断信息。

归因表中的已实现、未实现、分红和费用均表示所选区间内的变化，不是成立以来累计值。区间开始时已经存在的未实现盈亏作为期初基线，只有区间内新增的价格变化进入本期贡献。

## 10. 页面设计

组合页在现有“组合总览、持仓与交易、复盘中心”之后增加“绩效分析”标签。

### 10.1 控制栏

- 区间：成立以来、YTD、1 年、6 个月、3 个月、自定义；
- 基准：SPY、QQQ、DIA、IWM、自定义；
- 数据状态：来源、行情时间、可用起始日、fresh/stale/unavailable；
- 操作：刷新绩效、保存默认基准、配置组合。

自定义区间必须在组合成立日到今天之间，且开始日不晚于结束日。

### 10.2 绩效摘要

显示：

- 组合 TWR；
- 基准收益；
- 超额收益；
- MWR/XIRR；
- 年化收益；
- 当前回撤；
- 最大回撤；
- 上涨日占比。

不可计算的指标显示原因，例如“样本不足”“现金流不足”“行情区间不连续”，不显示 `0`。

### 10.3 图表

- 主图展示组合和基准从 100 开始的归一化曲线；
- 副图展示组合回撤百分比；
- stale 点保留并带状态提示；
- unavailable 区间断线；
- 鼠标或键盘聚焦点显示日期、组合值、基准值、日收益和数据状态；
- 使用现有 Recharts，不新增图表库。

### 10.4 贡献与现金流

贡献表显示：

- 股票代码或贡献类型；
- 区间收益贡献；
- 金额盈亏；
- 已实现盈亏；
- 未实现盈亏；
- 分红；
- 费用。

默认按收益贡献降序，可切换“贡献最大”和“拖累最大”。现金流表显示初始资金、入金和出金，但不进入贡献排名。

### 10.5 拆股确认

存在未确认拆股时，在绩效页顶部显示阻断横幅。确认对话框展示：

- 股票代码；
- 生效日期；
- 正向或反向拆股；
- 原比例和新比例；
- 数量倍数；
- 供应商来源；
- 受影响的当前持仓数量预览。

用户可以修改比例、确认、忽略或手动新增拆股。确认和忽略都需要记录时间；忽略需要非空备注。

## 11. 错误与降级

- **供应商 429/失败：** 有 SQLite 旧缓存则返回 stale；没有缓存则绩效区域 unavailable，账本和组合总览继续可用。
- **部分股票缺失：** 有效股票继续返回；绩效引擎按持仓期判断缺失是否阻断。
- **无效自定义基准：** 保留原基准，显示字段级错误并允许重试。
- **XIRR 不收敛：** 只隐藏 MWR，不影响 TWR、基准和归因。
- **缓存损坏：** 丢弃派生缓存并重新计算，不修改账本。
- **设置损坏：** 隔离损坏记录并恢复迁移默认值，同时显示恢复提示。
- **重复拆股：** 按 `sourceEventId` 返回已有事件，不追加副本。
- **归因不平：** 隐藏贡献结果，显示对账差额和诊断代码。
- **旧缓存与新账本不匹配：** 账本哈希变化立即使绩效缓存失效。

## 12. 测试策略

### 12.1 服务端

- 批量代码标准化、去重、100 个上限和非法字符；
- 日期范围和 adjustment 校验；
- Alpaca 批量日线多页遍历；
- `raw` 与 `all` 参数透传；
- 部分代码无数据；
- 429 后返回旧缓存；
- 拆股比例映射、比例缺失和非法比例隔离；
- fixture provider 覆盖批量日线和正向/反向拆股。

### 12.2 仓库

- 设置迁移幂等；
- 初始资金、成立日期和基准校验；
- 入金、出金和拆股事件不可变；
- 出金不能导致负现金；
- 拆股事件去重；
- 派生缓存键和损坏缓存隔离。

### 12.3 纯函数

- 只有初始资金；
- 入金和出金不被计为收益；
- 周末现金流进入下一估值子期间；
- 买卖、分红和费用；
- 正向和反向拆股；
- 多次拆股；
- 拆股后加仓和减仓；
- 最长 5 日价格沿用与第 6 日 unavailable；
- TWR 链接；
- XIRR 正常、现金流符号不足和不收敛；
- 基准归一化与超额收益；
- 年化收益样本门槛；
- 当前和最大回撤；
- 日度与区间贡献对账；
- 金额盈亏对账；
- 浮点和小数股边界。

### 12.4 React

- 新标签可访问名称与键盘切换；
- 区间切换和自定义日期校验；
- 预设与自定义基准；
- 自定义基准失败不覆盖设置；
- loading、fresh、stale、unavailable 和部分缺失；
- 样本不足和 XIRR 不可用文案；
- 拆股确认、修改比例、忽略备注和手动补录；
- 贡献排序与对账失败状态；
- 账本和复盘标签在绩效失败时仍可使用。

### 12.5 Playwright

Fixture-backed 流程：

1. 打开组合并迁移默认设置；
2. 修改初始资金并记录入金；
3. 记录买入并打开绩效标签；
4. 验证成立以来净值、SPY 基准和摘要；
5. 切换 QQQ 和自定义基准；
6. 注入拆股候选，确认后验证持仓数量与净值连续；
7. 验证贡献金额和 TWR 对账；
8. 注入 Alpaca 429，验证旧缓存和 stale 状态；
9. 重新加载页面，验证设置、账本、拆股和分析缓存持久化。

## 13. 验收标准

- 用户可以配置初始资金、成立日期和默认基准。
- 用户可以记录入金、出金和经确认的拆股事件。
- 已有组合可以幂等迁移，原账本事件不被改写。
- 绩效曲线从组合成立日或实际可用起始日开始。
- 外部现金流不被计算为投资收益。
- 组合 TWR、MWR、基准收益、超额收益、年化收益和回撤遵守本规格口径。
- 基准默认 SPY，并支持 QQQ、DIA、IWM 和有效自定义股票/ETF。
- 个股、分红和费用贡献可以与组合收益和金额盈亏对账。
- 未确认拆股、长期缺价和 unavailable 数据不会产生伪精确结果。
- 绩效失败不影响账本、持仓、监控和周度复盘。
- Vitest、TypeScript/Vite build、Playwright、live smoke、密钥扫描和生产 mock 扫描全部通过。

## 14. 实施边界与顺序

建议按以下顺序实施：

1. 批量历史日线与拆股详情合同；
2. 组合设置和账本现金流/拆股扩展；
3. 历史加载器与分析缓存；
4. 每日净值、TWR、MWR 和回撤引擎；
5. 归因与严格对账；
6. 绩效分析标签与拆股确认交互；
7. fixture E2E、文档和完整验证。

每一阶段必须保持现有组合页面和账本测试通过，且不得引入服务端用户组合持久化。
