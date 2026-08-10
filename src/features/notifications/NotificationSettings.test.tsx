import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { NotificationSettings } from "./NotificationSettings";

const status = { configured: true, publicKey: "AQIDBA", subscriptions: [] };
afterEach(() => cleanup());
const subscription = { endpoint: "https://push.example/one", toJSON: () => ({ endpoint: "https://push.example/one", expirationTime: null, keys: { p256dh: "client", auth: "secret" } }), unsubscribe: vi.fn(async () => true) };
function api(overrides = {}) { return { getStatus: vi.fn(async () => status), subscribe: vi.fn(async () => ({ id: "sub-1" })), revoke: vi.fn(async () => ({ revoked: true })), test: vi.fn(async () => ({ accepted: true })), ...overrides }; }
function registration(existing: typeof subscription | null = null) { return { pushManager: { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => subscription) } } as never; }

test("does not request permission until the user explicitly enables notifications", async () => {
  const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
  const service = api();
  render(<NotificationSettings permission="default" api={service as never} requestPermission={requestPermission} getRegistration={async () => registration()} userAgent="Chrome" />);
  await screen.findByText("尚未启用系统通知");
  expect(requestPermission).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "启用系统通知" }));
  expect(requestPermission).toHaveBeenCalledOnce();
  await waitFor(() => expect(service.subscribe).toHaveBeenCalledOnce());
  expect(await screen.findByText("系统通知已启用")).toBeVisible();
});

test("shows denied and server-not-configured states without attempting subscription", async () => {
  const denied = api();
  const { unmount } = render(<NotificationSettings permission="denied" api={denied as never} getRegistration={async () => registration()} />);
  expect(await screen.findByText("浏览器已拒绝通知权限")).toBeVisible();
  expect(denied.subscribe).not.toHaveBeenCalled();
  unmount();
  render(<NotificationSettings permission="default" api={api({ getStatus: vi.fn(async () => ({ configured: false, subscriptions: [] })) }) as never} getRegistration={async () => registration()} />);
  expect(await screen.findByText("服务端尚未配置 Web Push")).toBeVisible();
});

test("detects, tests, and revokes an existing browser subscription", async () => {
  subscription.unsubscribe.mockClear();
  const service = api();
  render(<NotificationSettings permission="granted" api={service as never} getRegistration={async () => registration(subscription)} />);
  expect(await screen.findByText("系统通知已启用")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "发送测试通知" }));
  expect(await screen.findByText("测试通知已进入后台队列")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "关闭系统通知" }));
  expect(await screen.findByText("系统通知已关闭")).toBeVisible();
  expect(service.revoke).toHaveBeenCalledOnce();
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
});

test("offers re-subscribe when permission exists but the browser subscription is missing", async () => {
  render(<NotificationSettings permission="granted" api={api() as never} getRegistration={async () => registration(null)} />);
  expect(await screen.findByRole("button", { name: "重新订阅" })).toBeVisible();
});
