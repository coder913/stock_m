# stock_m

美股研究与模拟决策工作台。当前版本提供延迟模拟行情、今日信号、NVDA 研究页、版本化投资逻辑和必须关联逻辑的模拟建仓。

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
```

产品设计见 `docs/superpowers/specs/2026-08-04-stock-m-design.md`，实施计划见 `docs/superpowers/plans/2026-08-04-stock-m-research-loop.md`。
