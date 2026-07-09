import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const result = spawnSync("git", ["ls-files", "frontend/src"], {
  cwd: root,
  encoding: "utf8"
});

if (result.status !== 0) {
  throw new Error(result.stderr || "无法读取前端文件列表");
}

const files = result.stdout
  .split("\n")
  .filter((file) => /\.(tsx?|jsx?)$/.test(file));

const forbidden = [
  { pattern: />\s*Submit\s*</, label: "Submit" },
  { pattern: />\s*Save\s*</, label: "Save" },
  { pattern: />\s*Delete\s*</, label: "Delete" },
  { pattern: />\s*Cancel\s*</, label: "Cancel" },
  { pattern: />\s*Loading\s*</, label: "Loading" },
  { pattern: />\s*Edit\s*</, label: "Edit" },
  { pattern: />\s*Error\s*</, label: "Error" },
  { pattern: /Agent配置|Agent 配置|商户 Agent|保存 Agent|加载 Agent|Agent名称/, label: "Agent mixed copy" },
  { pattern: /AI助手|AI 回复建议/, label: "AI mixed copy" }
];

const failures = [];
for (const file of files) {
  const content = readFileSync(resolve(root, file), "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      failures.push(`${file}: ${rule.label}`);
    }
  }
}

if (failures.length) {
  console.error("后台文案检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`后台文案检查通过：${files.length} 个前端源码文件`);

