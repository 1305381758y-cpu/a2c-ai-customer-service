import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "output", "playwright", "scroll-smoke");
mkdirSync(outDir, { recursive: true });

const tempDir = mkdtempSync(join(tmpdir(), "a2c-ui-smoke-"));
const port = Number(process.env.UI_SMOKE_PORT || 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const databaseUrl = join(tempDir, "ui-smoke.db");

const server = spawn(process.execPath, ["--experimental-sqlite", "dist/server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    DEFAULT_ADMIN_EMAIL: "admin@example.com",
    DEFAULT_ADMIN_PASSWORD: "Admin123456"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await delay(300);
  }
  throw new Error(`本地服务未启动成功。\n${serverOutput.slice(-2000)}`);
}

async function login(page, email, password) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector("aside nav", { timeout: 10_000 });
}

async function createMerchantUser(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/admin/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "滚动测试商户",
        country: {
          code: "bo",
          name: "玻利维亚",
          defaultLanguage: "es",
          requirePlatformAccount: true,
          requirePhone: true,
          requireTelegram: true,
          requireWhatsApp: false
        },
        adminUser: {
          email: "merchant-scroll@example.com",
          name: "滚动测试商户管理员",
          password: "Merchant123456"
        }
      })
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.statusText);
    return response.json();
  });
  return result;
}

async function logout(page) {
  await page.locator("button.logout").click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForSelector("main.login", { timeout: 10_000 });
}

async function clickNav(page, label) {
  await page.locator("aside nav").getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction((title) => document.querySelector("main header h1")?.textContent?.trim() === title, label, { timeout: 10_000 });
  await page.waitForTimeout(250);
}

async function assertVisibleScrollables(page, label, role) {
  const result = await page.evaluate(() => {
    const selectors = [
      "main",
      "aside nav",
      ".work-panel",
      ".detail-panel",
      ".dashboard-page",
      ".conversation-workspace",
      ".account-list",
      ".customer-list",
      ".chat-pane",
      ".chat-window",
      ".training-loop-panel",
      ".account-scroll-list",
      ".conversation-list",
      ".table",
      ".config-checks"
    ];
    const seen = new Set();
    const failures = [];
    const checked = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue;
        seen.add(node);
        const style = window.getComputedStyle(node);
        const hidden = style.display === "none" || style.visibility === "hidden";
        if (hidden || node.offsetParent === null && style.position !== "fixed") continue;
        const maxScrollTop = node.scrollHeight - node.clientHeight;
        if (maxScrollTop <= 8) continue;
        node.scrollTop = 0;
        const before = node.scrollTop;
        node.scrollTop = node.scrollHeight;
        const after = node.scrollTop;
        checked.push({ selector, before, after, maxScrollTop });
        if (after <= before && maxScrollTop > 8) failures.push({ selector, before, after, maxScrollTop });
      }
    }
    return { checked, failures };
  });
  await page.screenshot({ path: join(outDir, `${role}-${label}.png`), fullPage: true });
  if (result.failures.length) {
    throw new Error(`${role}/${label} 存在无法滚动的容器：${JSON.stringify(result.failures)}`);
  }
  return result.checked.length;
}

async function smokeRole(page, role, labels) {
  const report = [];
  for (const label of labels) {
    await clickNav(page, label);
    const count = await assertVisibleScrollables(page, label, role);
    report.push(`${role}/${label}: ${count} 个可滚动容器通过`);
  }
  return report;
}

async function confirmDialogAction(page, name) {
  await page.locator(".confirm-dialog").getByRole("button", { name, exact: true }).click();
}

async function smokeMerchantSettingsToggles(page) {
  await clickNav(page, "设置");

  await page.getByRole("button", { name: "关闭智能回复", exact: true }).click();
  await confirmDialogAction(page, "关闭智能回复");
  await page.waitForFunction(() => document.body.textContent?.includes("已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。"), { timeout: 10_000 });

  await page.getByRole("button", { name: "开启智能回复", exact: true }).click();
  await confirmDialogAction(page, "开启智能回复");
  await page.waitForFunction(() => document.body.textContent?.includes("已开启：客户消息会自动调用智能服务，并通过当前 A2C 客服账号回复。"), { timeout: 10_000 });

  await page.getByRole("button", { name: "开启模拟训练", exact: true }).click();
  await confirmDialogAction(page, "开启模拟训练");
  await page.waitForFunction(() => document.body.textContent?.includes("已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。"), { timeout: 10_000 });

  await page.getByRole("button", { name: "关闭模拟训练", exact: true }).click();
  await confirmDialogAction(page, "关闭模拟训练");
  await page.waitForFunction(() => document.body.textContent?.includes("已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"), { timeout: 10_000 });

  await page.getByRole("button", { name: "开启话本流程", exact: true }).click();
  await confirmDialogAction(page, "开启话本流程");
  await page.waitForFunction(() => document.body.textContent?.includes("已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。"), { timeout: 10_000 });

  await page.getByRole("button", { name: "关闭话本流程", exact: true }).click();
  await confirmDialogAction(page, "关闭话本流程");
  await page.waitForFunction(() => document.body.textContent?.includes("已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"), { timeout: 10_000 });

  return "商户管理员/设置: 3 个高风险开关点击生效";
}

async function smokeDateFilterRequest(page, navLabel, endpointPart, reportLabel) {
  await clickNav(page, navLabel);
  await page.getByLabel("开始时间").fill("2026-07-01T00:00:01");
  await page.getByLabel("结束时间").fill("2026-07-01T23:59:59");
  const [response] = await Promise.all([
    page.waitForResponse((res) => {
      if (!res.url().includes(endpointPart)) return false;
      const url = new URL(res.url());
      return url.searchParams.get("startAt") === "2026-07-01T00:00:01"
        && url.searchParams.get("endAt") === "2026-07-01T23:59:59"
        && Boolean(url.searchParams.get("timeZone"));
    }, { timeout: 10_000 }),
    page.getByRole("button", { name: navLabel === "总览" ? "筛选时间" : "筛选", exact: true }).click()
  ]);
  if (!response.ok()) throw new Error(`${reportLabel} 筛选请求失败：${response.status()}`);
  return `${reportLabel}: 时间筛选请求生效`;
}

async function main() {
  await waitForHealth();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const report = [];
  try {
    await login(page, "admin@example.com", "Admin123456");
    await createMerchantUser(page);
    report.push(...await smokeRole(page, "平台管理员", ["总览", "模型调用", "商户", "后台账号", "配置", "智能体配置", "客户", "话本流程", "意图学习", "素材", "知识库", "样本", "会话", "接管"]));
    await logout(page);
    await login(page, "merchant-scroll@example.com", "Merchant123456");
    report.push(...await smokeRole(page, "商户管理员", ["总览", "模型调用", "训练中心", "模拟训练", "智能体配置", "话本流程", "意图学习", "客户", "会话", "接管", "设置"]));
    report.push(await smokeDateFilterRequest(page, "总览", "/api/merchant/dashboard", "商户管理员/总览"));
    report.push(await smokeDateFilterRequest(page, "模型调用", "/api/merchant/ai-calls/stats", "商户管理员/模型调用"));
    report.push(await smokeMerchantSettingsToggles(page));
    await page.setViewportSize({ width: 1024, height: 768 });
    report.push(...await smokeRole(page, "商户管理员-窄屏1024", ["总览", "模型调用", "话本流程", "会话", "设置"]));
    console.log(report.join("\n"));
  } finally {
    await browser.close();
  }
}

main().finally(() => {
  server.kill("SIGTERM");
});
