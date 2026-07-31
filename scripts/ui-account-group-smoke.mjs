import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "output", "playwright", "account-group");
mkdirSync(outputDir, { recursive: true });

const databaseUrl = join(mkdtempSync(join(tmpdir(), "a2c-account-group-ui-")), "test.db");
const port = Number(process.env.UI_ACCOUNT_GROUP_PORT || 4321);
const baseUrl = `http://127.0.0.1:${port}`;
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
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`本地服务未启动成功。\n${serverOutput.slice(-2000)}`);
}

async function login(page, email, password) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForSelector("aside nav", { timeout: 10_000 });
}

async function api(page, url, options = {}) {
  return page.evaluate(async ({ requestUrl, requestOptions }) => {
    const response = await fetch(requestUrl, {
      ...requestOptions,
      headers: { "Content-Type": "application/json", ...(requestOptions.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || response.statusText);
    return payload;
  }, { requestUrl: url, requestOptions: options });
}

async function seed(page) {
  const created = await api(page, "/api/admin/merchants", {
    method: "POST",
    body: JSON.stringify({
      name: "客服分组布局验收商户",
      country: { code: "br", name: "巴西", defaultLanguage: "pt" },
      adminUser: { email: "group-layout@example.com", name: "布局验收管理员", password: "Merchant123456" }
    })
  });
  return created.merchant?.id || created.id;
}

async function seedMerchantConfiguration(page) {
  const countries = (await api(page, "/api/merchant/countries")).rows;
  const countryId = countries[0].id;
  for (let index = 1; index <= 24; index += 1) {
    await api(page, "/api/merchant/teacher-tg-links", {
      method: "POST",
      body: JSON.stringify({
        countryId,
        label: index % 3 === 0 ? `导师 ${index}` : "",
        url: `https://t.me/layout_acceptance_teacher_${String(index).padStart(2, "0")}_with_a_very_long_username`,
        priority: index % 4,
        rotationCount: index % 5 + 1
      })
    });
  }
  let firstGroupId;
  for (const name of ["巴西主账号组", "巴西夜班账号组", "巴西备用账号组", "巴西活动账号组"]) {
    const group = await api(page, "/api/merchant/a2c/account-groups", { method: "POST", body: JSON.stringify({ name, countryId }) });
    firstGroupId ??= group.id;
  }
  await api(page, `/api/merchant/a2c/account-groups/${firstGroupId}/invite-codes/import`, {
    method: "POST",
    body: JSON.stringify({ codes: "CU5A98", registerUrl: "https://register.example.com/account/create?invite_code={code}&source=account_group_layout_test", reusable: true })
  });
}

async function assertLayout(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const details = page.locator(".teacher-binding-section").first();
  if (await details.getAttribute("open") !== null) await details.locator("summary").click();
  const closedResult = await page.evaluate(() => {
    const section = document.querySelector(".account-group-section");
    const workspace = document.querySelector(".account-group-workspace");
    if (!(section instanceof HTMLElement) || !(workspace instanceof HTMLElement)) throw new Error("客服分组区域未渲染");
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sectionOverflow: section.scrollWidth - section.clientWidth,
      workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
      inviteDetailsOpen: document.querySelector(".teacher-binding-section")?.hasAttribute("open") ?? false
    };
  });
  if (closedResult.documentOverflow > 2 || closedResult.sectionOverflow > 2 || closedResult.workspaceOverflow > 2) {
    throw new Error(`${width}px 页面存在横向溢出：${JSON.stringify(closedResult)}`);
  }
  if (closedResult.inviteDetailsOpen) throw new Error(`${width}px 导师绑定未保持默认收起`);

  await details.locator("summary").click();
  const grid = details.locator(".teacher-binding-grid");
  await grid.waitFor({ state: "visible" });
  const openResult = await page.evaluate(() => {
    const gridNode = document.querySelector(".teacher-binding-section .teacher-binding-grid");
    const section = document.querySelector(".account-group-section");
    if (!(gridNode instanceof HTMLElement) || !(section instanceof HTMLElement)) throw new Error("导师绑定区域未渲染");
    return {
      scrollHeight: gridNode.scrollHeight,
      clientHeight: gridNode.clientHeight,
      overflowY: getComputedStyle(gridNode).overflowY,
      sectionOverflow: section.scrollWidth - section.clientWidth
    };
  });
  if (openResult.scrollHeight <= openResult.clientHeight || openResult.overflowY !== "auto") {
    throw new Error(`${width}px 导师列表没有使用内部滚动：${JSON.stringify(openResult)}`);
  }
  if (openResult.sectionOverflow > 2) throw new Error(`${width}px 展开导师列表后发生横向溢出`);

  await details.getByPlaceholder("搜索导师名称或链接").fill("teacher_03");
  if (await grid.locator("label").count() !== 1) throw new Error(`${width}px 导师搜索结果不正确`);
  await details.getByRole("button", { name: "全选筛选结果", exact: true }).click();
  await details.getByText("已选 1 / 24", { exact: true }).waitFor({ state: "visible" });
  await details.getByRole("button", { name: "清空选择", exact: true }).click();
  await details.getByText("已选 0 / 24", { exact: true }).waitFor({ state: "visible" });
  await details.getByPlaceholder("搜索导师名称或链接").fill("");
  await page.screenshot({ path: join(outputDir, `account-group-${width}x${height}.png`), fullPage: true });
  await details.locator("summary").click();
  return `${width}×${height}：无横向溢出，导师列表收起、搜索、批量选择和内部滚动通过`;
}

async function main() {
  await waitForHealth();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await login(page, "admin@example.com", "Admin123456");
    await seed(page);
    await page.locator("button.logout").click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.waitForSelector("main.login");
    await login(page, "group-layout@example.com", "Merchant123456");
    await seedMerchantConfiguration(page);
    await page.locator("aside nav").getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "客服账号与邀请码", exact: true }).click();
    await page.getByText("客服账号分组", { exact: true }).waitFor({ state: "visible" });
    const report = [];
    for (const viewport of [[1024, 768], [1366, 768], [1440, 900], [2048, 1152]]) {
      report.push(await assertLayout(page, viewport[0], viewport[1]));
    }
    console.log(report.join("\n"));
  } finally {
    await browser.close();
  }
}

main().finally(() => server.kill("SIGTERM"));
