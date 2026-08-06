# stock_m

美股研究与模拟决策工作台。当前版本提供延迟模拟行情、今日信号、策略选股、市场主题、财报日历、已保存筛选、自选分组、NVDA 研究页、同业比较、版本化投资逻辑和必须关联逻辑的模拟建仓。

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

产品设计见 `docs/superpowers/specs/2026-08-04-stock-m-design.md` 和 `docs/superpowers/specs/2026-08-06-discovery-research-design.md`，实施计划见 `docs/superpowers/plans/2026-08-06-discovery-research.md`。
