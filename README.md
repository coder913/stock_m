# stock_m

美股研究与模拟决策工作台。当前版本提供延迟模拟行情、策略选股、自选分组、研究页、同业比较、不可变模拟交易账本、组合风险提醒与版本化周度复盘。

所有价格与事件均为确定性模拟数据，仅供产品演示与研究，不构成投资建议，也不会发送真实订单。

## 运行

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm test
npm run build
npm run test:e2e
```

## 研究与发现

- 内置高质量成长、合理估值、财报改善和放量突破四套可编辑模板。
- 已保存筛选保存在浏览器本地存储 `stock_m:saved-screens:v1`；自选分组保存在 `stock_m:watchlists:v1`。
- 数据来自确定性的延迟演示数据集，并在页面上明确标明，不构成投资建议。

## 持仓与复盘

- 模拟交易写入 `stock_m:portfolio-ledger:v1`；旧版 `stock_m:orders` 在首次使用时迁移一次。
- 组合页展示成本、盈亏、行业暴露、集中度和回撤；缺少价格会显示“估值不可用”。
- 应用内提醒采用固定阈值：单股 20%/30%、行业 35%/45%、回撤 10%/15%。
- 周报和组合快照分别保存在 `stock_m:portfolio-reviews:v1` 与 `stock_m:portfolio-snapshots:v1`。
- 浏览器测试使用已安装的稳定版 Chrome。

产品设计见 `docs/superpowers/specs/2026-08-04-stock-m-design.md` 和 `docs/superpowers/specs/2026-08-06-discovery-research-design.md`，实施计划见 `docs/superpowers/plans/2026-08-06-discovery-research.md`。
