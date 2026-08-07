import { expect, test } from "vitest";
import { UniverseRepository } from "./universeRepository";
test("adds symbols once and persists default removals", () => { const storage = localStorage; storage.clear(); const repository = new UniverseRepository(storage); repository.add("xom"); repository.add("XOM"); repository.remove("AAPL"); expect(repository.list(["AAPL", "MSFT"])).toEqual(["MSFT", "XOM"]); });
test("rejects invalid symbols before persistence", () => { localStorage.clear(); const repository = new UniverseRepository(localStorage); expect(() => repository.add("NVDA<script>")).toThrow("股票代码格式无效"); expect(localStorage.getItem("stock_m:user-universe:v1")).toBeNull(); });
