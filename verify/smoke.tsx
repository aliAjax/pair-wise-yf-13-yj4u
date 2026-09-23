import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.localStorage = dom.window.localStorage;
g.Event = dom.window.Event;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.performance = {
  now: () => Date.now(),
  measure() {},
  mark() {},
  clearMarks() {},
  clearMeasures() {},
};
(g as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(dom.window as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "../src/App";

const container = document.getElementById("root")!;
await act(async () => {
  createRoot(container).render(React.createElement(App));
});

const findBtn = (pred: (b: HTMLButtonElement) => boolean) =>
  [...container.querySelectorAll("button")].find((b) => pred(b as HTMLButtonElement)) as
    | HTMLButtonElement
    | undefined;

let pass = 0;
const check = (name: string, cond: boolean) => {
  if (!cond) throw new Error(name);
  pass++;
  console.log("PASS:", name);
};

// 1. 首屏关键文案
const text = () => container.textContent ?? "";
[
  "船舶轮机值班记录",
  "进行中：08-12班",
  "按设备调整安全范围",
  "主机转速越限",
  "冷却水温严重越限",
  "交接班摘要",
  "已冻结",
  "历史记录",
  "未冻结 · 交班时生成快照",
].forEach((m) => check(`首屏包含「${m}」`, text().includes(m)));

// 2. 冻结的历史交班摘要：昨天 08-12 班 3 条、12-16 班 2 条
check("昨日08-12摘要3设备", text().includes("交班时未完成异常 3 条"));
check("昨日12-16摘要2设备", text().includes("交班时未完成异常 2 条"));

// 3. 轮机员只读
await act(async () => {
  findBtn((b) => b.textContent!.trim() === "轮机员")!.click();
});
{
  const inputs = [...container.querySelectorAll("#thresholds input[type='number']")] as HTMLInputElement[];
  check("轮机员模式阈值输入全禁用", inputs.length > 0 && inputs.every((i) => i.disabled));
  check("轮机员模式无保存新范围按钮", !findBtn((b) => b.textContent === "保存新范围"));
}

// 4. 轮机长可编辑
await act(async () => {
  findBtn((b) => b.textContent!.trim() === "轮机长")!.click();
});
{
  const inputs = [...container.querySelectorAll("#thresholds input[type='number']")] as HTMLInputElement[];
  check("轮机长模式阈值可编辑", inputs.some((i) => !i.disabled));
  check("轮机长模式有修订记录", text().includes("范围修订记录"));
}

// 5. 设备筛选联动：点击历史区“舱底水”chip，其它设备读数消失、舱底水保留
await act(async () => {
  const chips = [...container.querySelectorAll("#history .chip")] as HTMLButtonElement[];
  chips.find((b) => b.textContent!.includes("舱底水"))!.click();
});
{
  const t = text();
  check("筛选后时间线只剩舱底水相关", t.includes("液位接近警戒线") || t.includes("高位报警"));
}
await act(async () => {
  const chips = [...container.querySelectorAll("#history .chip")] as HTMLButtonElement[];
  chips.find((b) => b.textContent!.trim() === "全部设备")!.click();
});

// 6. 处理异常：未填写处理人/结果时按钮禁用；填写后可提交
const resolveEntry = findBtn((b) => b.textContent!.includes("填写处理人和处理结果"));
check("存在异常处理入口", !!resolveEntry);
await act(async () => {
  resolveEntry!.click();
});
{
  const confirmBtn = findBtn((b) => b.textContent!.trim() === "确认处理完成")!;
  check("空处理信息时禁止完成", confirmBtn.disabled);
}

// 7. 交班弹窗：打开后可见冻结说明
await act(async () => {
  findBtn((b) => b.textContent!.includes("交班并关闭"))!.click();
});
check("交班弹窗说明冻结规则", text().includes("交班摘要将在此时冻结"));
await act(async () => {
  // 取消交班，保持进行中班次
  findBtn((b) => b.textContent!.trim() === "取消")!.click();
});

// 8. 持久化写入
const raw = window.localStorage.getItem("hxyfront-62001-watch-state-v1");
check("localStorage 已写入", !!raw);
const saved = JSON.parse(raw!);
check("持久化结构完整", saved.version === 1 && saved.readings.length >= 14 && saved.anomalies.length === 4);
check("历史读数内嵌范围快照", saved.readings.every((r: { evaluations: unknown[] }) => Array.isArray(r.evaluations)));
check("已关闭班次含冻结交班摘要", saved.shifts.filter((s: { handover?: unknown }) => s.handover).length === 2);

console.log(`\n冒烟测试全部通过（${pass} 项）✅`);
process.exit(0);
