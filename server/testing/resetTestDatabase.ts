import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";

/**
 * Reset every application-owned table while preserving the migration ledger.
 * This helper is intentionally kept under server/testing and is never wired by
 * the production composition root.
 */
export async function resetTestDatabase(database: Kysely<Database>): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await sql`
      truncate table
        broker.drift,
        broker.reconciliation_run,
        broker.ledger_event,
        broker.activity,
        broker.fill,
        broker.order_projection,
        broker.order_event,
        broker.remote_order,
        broker.cancel_intent,
        broker.order_intent,
        broker.order_preview_audit,
        broker.account_snapshot,
        broker.account,
        platform.idempotency_record,
        platform.outbox_event,
        platform.inbox_event,
        platform.dead_letter,
        platform.worker_heartbeat,
        platform.browser_migration_record,
        platform.browser_migration_receipt,
        platform.installation,
        notification.delivery_attempt,
        notification.delivery,
        notification.push_subscription,
        monitor.alert_action,
        monitor.alert,
        monitor.condition_evaluation,
        monitor.thesis_review,
        monitor.run,
        monitor.schedule_state,
        core.portfolio_weekly_review,
        core.portfolio_snapshot,
        core.portfolio_alert_action,
        core.portfolio_alert,
        core.manual_portfolio_ignored_split,
        core.manual_portfolio_ledger_event,
        core.manual_portfolio_settings,
        core.manual_portfolio,
        core.thesis_condition,
        core.thesis_version,
        core.watchlist_symbol,
        core.watchlist_group,
        core.saved_screen,
        core.user_universe_symbol,
        core.user_universe_revision,
        market.refresh_attempt,
        market.provider_state,
        market.cache_entry
      restart identity cascade
    `.execute(transaction);

    await transaction.insertInto("platform.installation").values({ id: "local-single-user", createdAt: new Date() }).execute();
    await transaction.insertInto("core.user_universe_revision").values({ id: "local-single-user", version: 0 }).execute();
    await transaction.insertInto("core.manual_portfolio").values({ id: "default", revision: 0 }).execute();
    await transaction.insertInto("core.manual_portfolio_settings").values({
      portfolioId: "default",
      initialCash: 10_000,
      inceptionDate: new Date().toISOString().slice(0, 10),
      benchmarkSymbol: "SPY",
      baseCurrency: "USD",
      version: 1,
      updatedAt: new Date(),
    }).execute();
  });
}
