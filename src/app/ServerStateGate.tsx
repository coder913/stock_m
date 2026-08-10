import { useEffect, useState, type ReactNode } from "react";
import { migrationKeys } from "../features/migration/browserStateExport";
import { MigrationWizard } from "../features/migration/MigrationWizard";
import { useRepositories } from "./repositories";
import { loadServerReadiness, type ServerReadiness } from "./serverReadiness";

type GateState = "checking" | "ready" | "migration" | "unavailable";

export function ServerStateGate({ children, health, storage = localStorage }: { children: ReactNode; health?: Promise<ServerReadiness>; storage?: Storage }) {
  const { migration } = useRepositories();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let active = true;
    void (health ?? loadServerReadiness()).then(async (status) => {
      if (!active) return;
      if (!status.ready || status.services.postgres !== "ready") { setState("unavailable"); return; }
      const hasSource = migrationKeys.some((key) => storage.getItem(key) !== null);
      if (!hasSource) { setState("ready"); return; }
      const receipt = await migration.getReceipt();
      if (!active) return;
      if (!receipt) { setState("migration"); return; }
      storage.setItem("stock_m:server-migration-receipt:v1", JSON.stringify(receipt));
      setState("ready");
    }).catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, [health, migration, storage]);

  if (state === "unavailable") return <p role="alert">服务端数据暂不可用，请检查 PostgreSQL 与 API 后重试。</p>;
  if (state === "migration") return <MigrationWizard api={migration} storage={storage} onComplete={() => setState("ready")} />;
  if (state === "checking") return <p role="status">正在检查服务端数据状态</p>;
  return children;
}
