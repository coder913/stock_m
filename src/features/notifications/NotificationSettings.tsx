import { useEffect, useState } from "react";
import { NotificationApiClient, type NotificationApi, type NotificationStatus } from "./notificationApiClient";
import { revokeBrowserPush, subscribeBrowserPush } from "./pushSubscription";
import "./notifications.css";

type ViewState = "loading" | "unsupported" | "not-configured" | "denied" | "enabled" | "disabled" | "error";

const defaultPermission = (): NotificationPermission => typeof Notification === "undefined" ? "default" : Notification.permission;
const defaultRequestPermission = (): Promise<NotificationPermission> => Notification.requestPermission();
const defaultRegistration = (): Promise<ServiceWorkerRegistration> => navigator.serviceWorker.ready;

export function NotificationSettings({
  api = new NotificationApiClient(), permission = defaultPermission(), requestPermission = defaultRequestPermission,
  getRegistration, userAgent = typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
}: {
  api?: NotificationApi;
  permission?: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  getRegistration?: () => Promise<ServiceWorkerRegistration>;
  userAgent?: string;
}) {
  const registration = getRegistration ?? (typeof navigator !== "undefined" && "serviceWorker" in navigator ? defaultRegistration : undefined);
  const [view, setView] = useState<ViewState>("loading");
  const [serverStatus, setServerStatus] = useState<NotificationStatus>();
  const [browserSubscription, setBrowserSubscription] = useState<PushSubscription | null>(null);
  const [lastResult, setLastResult] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api.getStatus().then(async (status) => {
      if (!active) return;
      setServerStatus(status);
      if (!status.configured) { setView("not-configured"); return; }
      if (!registration || (getRegistration === undefined && typeof PushManager === "undefined")) { setView("unsupported"); return; }
      if (permission === "denied") { setView("denied"); return; }
      if (permission !== "granted") { setView("disabled"); return; }
      const current = await (await registration()).pushManager.getSubscription();
      if (!active) return;
      setBrowserSubscription(current);
      setView(current ? "enabled" : "disabled");
    }).catch(() => { if (active) setView("error"); });
    return () => { active = false; };
  }, [api, permission, registration]);

  const enable = async () => {
    if (!registration || !serverStatus?.publicKey) return;
    setBusy(true); setLastResult(undefined);
    try {
      const granted = permission === "granted" ? "granted" : await requestPermission();
      if (granted !== "granted") { setView("denied"); return; }
      const subscription = await subscribeBrowserPush(await registration(), serverStatus.publicKey, api, userAgent);
      setBrowserSubscription(subscription); setView("enabled"); setLastResult("订阅已保存到服务端");
    } catch { setView("error"); setLastResult("订阅失败，请检查浏览器与网络后重试"); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!browserSubscription) return;
    setBusy(true); setLastResult(undefined);
    try { await revokeBrowserPush(browserSubscription, api); setBrowserSubscription(null); setView("disabled"); setLastResult("系统通知已关闭"); }
    catch { setLastResult("关闭失败，请稍后重试"); }
    finally { setBusy(false); }
  };

  const testDelivery = async () => {
    setBusy(true); setLastResult(undefined);
    try { await api.test(`push-test-${crypto.randomUUID()}`); setLastResult("测试通知已进入后台队列"); }
    catch { setLastResult("测试通知发送失败，请检查 Worker 状态"); }
    finally { setBusy(false); }
  };

  const stateText = view === "loading" ? "正在检查通知状态"
    : view === "not-configured" ? "服务端尚未配置 Web Push"
    : view === "denied" ? "浏览器已拒绝通知权限"
    : view === "enabled" ? "系统通知已启用"
    : view === "disabled" ? "尚未启用系统通知"
    : view === "unsupported" ? "当前浏览器不支持系统通知"
    : "通知状态暂时不可用";

  return <article className="notification-settings">
    <header><p className="eyebrow">设置</p><h1>系统通知</h1><p>页面关闭后，后台 Worker 仍可评估监控条件，并将重要变化发送到此浏览器。</p></header>
    <section className="notification-status-card" aria-live="polite"><div><span className={`status-dot status-${view}`} /><strong>{stateText}</strong></div>
      <p>服务端订阅设备：{serverStatus?.subscriptions.filter((item) => !item.revokedAt && !item.invalidAt).length ?? 0}</p>
      {view === "denied" && <p>请在浏览器站点设置中重新允许通知，然后刷新本页。</p>}
      {view === "not-configured" && <p>请配置 VAPID 密钥与订阅加密密钥，并重启 API 和 notification-worker。</p>}
      {view === "unsupported" && <p>需要 HTTPS 或 localhost、Service Worker 与 PushManager 支持。</p>}
      <div className="notification-actions">
        {view === "disabled" && <button type="button" disabled={busy} onClick={() => void enable()}>{permission === "granted" ? "重新订阅" : "启用系统通知"}</button>}
        {view === "enabled" && <><button type="button" disabled={busy} onClick={() => void testDelivery()}>发送测试通知</button><button type="button" className="secondary" disabled={busy} onClick={() => void revoke()}>关闭系统通知</button></>}
      </div>
      {lastResult && <p className="notification-result">{lastResult}</p>}
    </section>
    <section className="notification-explainer"><h2>后台投递条件</h2><ul><li>PostgreSQL、Redis、API、monitor-worker 与 notification-worker 必须持续运行。</li><li>浏览器权限只影响系统通知，不影响应用内监控告警。</li><li>429、超时和服务端错误会按 1、5、15、60 分钟重试；失效订阅会自动停用。</li></ul></section>
  </article>;
}
