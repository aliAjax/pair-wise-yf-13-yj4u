import assert from "node:assert";
import { makeSeedState } from "../src/lib/seed";
import { reducer } from "../src/store";
import { evaluate, worstOpenByDevice } from "../src/lib/domain";

let pass = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  pass++;
  console.log("PASS:", name);
};

// ---------- 1. 判定快照与裕度 ----------
{
  const evLow = evaluate("rpm", 59, { min: 60, max: 95 });
  const evCritLow = evaluate("rpm", 50, { min: 60, max: 95 });
  const evHigh = evaluate("rpm", 96, { min: 60, max: 95 });
  const evCritHigh = evaluate("rpm", 100, { min: 60, max: 95 });
  ok("越下限 1 单位判警告", evLow.status === "warning" && evLow.excess === 1);
  ok("越下限超裕度判严重", evCritLow.status === "critical" && evCritLow.excess === 10);
  ok("越上限 1 单位判警告", evHigh.status === "warning" && evHigh.excess === 1);
  ok("越上限超裕度判严重", evCritHigh.status === "critical");
  // 裕度 = 区间宽 10% = 3.5
  ok("紧急裕度为区间宽度10%", evLow.margin === 3.5);
}

// ---------- 2. 种子数据 ----------
const s0 = makeSeedState();
ok("种子有进行中班次", s0.currentShiftId === "sh-3");
ok("种子进行中异常2条", s0.anomalies.filter((a) => a.status === "open").length === 2);
ok("种子已处理异常2条", s0.anomalies.filter((a) => a.status === "resolved").length === 2);
const an3 = s0.anomalies.find((a) => a.id === "an-3");
ok("已处理异常含处理人", !!an3.handler);
ok("已处理异常含处理结果", !!an3.result);

// 昨日 08-12 交班快照：3 条未完成，按设备各一条
const sh1 = s0.shifts.find((s) => s.id === "sh-1");
ok("昨日08-12班已冻结摘要", sh1.handover.entries.length === 3);
ok("冻结摘要openCount=3", sh1.handover.openCount === 3);
ok("冻结摘要criticalCount=2", sh1.handover.criticalCount === 2);
const devicesInSh1 = new Set(sh1.handover.entries.map((e) => e.deviceId));
ok("冻结摘要每设备一条", devicesInSh1.size === 3);

// ---------- 3. 阈值后改，不改历史判定 ----------
// rd-2: 主机转速96，当时范围60~95 → 警告；现范围55~100
const rd2 = s0.readings.find((r) => r.id === "rd-2");
const rd2rpm = rd2.evaluations.find((e) => e.param === "rpm");
ok("历史读数保留旧范围", rd2rpm.range.max === 95 && rd2rpm.status === "warning");
ok("当前主机范围已改", s0.ranges["dev-main"].rpm.max === 100);

// 同一点按新范围应正常，但历史判定不变
const reEval = evaluate("rpm", 96, s0.ranges["dev-main"].rpm);
ok("同值按新范围为正常", reEval.status === "normal");

// 交班快照冻结后，后续异常被处理也不影响
ok("冻结的an-3(舱底水)仍是open快照", sh1.handover.entries.some(
  (e) => e.anomaly.anomalyId === "an-3"
));

// ---------- 4. 新读数按新范围判定 ----------
{
  const s1 = reducer(s0, {
    type: "addReading",
    deviceId: "dev-main",
    values: { rpm: 99, oilPressure: 0.4, coolantTemp: 70, fuelConsumption: 30 },
    note: "",
    at: Date.now(),
  });
  const r = s1.readings[s1.readings.length - 1];
  const ev = r.evaluations.find((e) => e.param === "rpm");
  ok("新读数99按新范围55~100正常", ev.status === "normal" && ev.range.max === 100);
  ok("新读数不产生异常", r.anomalyIds.length === 0);
}

// ---------- 5. 读数恢复后异常不自动关闭 + 同参数异常合并 ----------
// 用泵组滑油压力（范围0.2~0.4，种子中该设备无未关闭异常）
{
  let s = reducer(s0, {
    type: "addReading",
    deviceId: "dev-pump",
    values: { oilPressure: 0.42 },
    note: "",
    at: Date.now(),
  });
  const r1 = s.readings[s.readings.length - 1];
  ok("0.42越上限0.4产生异常", r1.anomalyIds.length === 1);
  const anId = r1.anomalyIds[0];
  const before = s.anomalies.find((a) => a.id === anId);
  ok("新异常为未处理", before.status === "open");

  // 读数恢复正常
  s = reducer(s, {
    type: "addReading",
    deviceId: "dev-pump",
    values: { oilPressure: 0.3 },
    note: "",
    at: Date.now() + 1,
  });
  const stillOpen = s.anomalies.find((a) => a.id === anId);
  ok("读数恢复后异常仍未关闭", stillOpen.status === "open");

  // 再次越限 → 并入同一条异常（refs 累计），不新建
  s = reducer(s, {
    type: "addReading",
    deviceId: "dev-pump",
    values: { oilPressure: 0.45 },
    note: "",
    at: Date.now() + 2,
  });
  const merged = s.anomalies.find((a) => a.id === anId);
  ok("再次越限并入同一异常", merged.refs.length === 2);
  const openOil = s.anomalies.filter((a) => a.source === "reading" && a.param === "oilPressure" && a.status === "open");
  ok("同设备同参数未完成异常只有1条", openOil.length === 1);

  // 必须有处理人+处理结果才能关闭
  s = reducer(s, {
    type: "resolveAnomaly",
    anomalyId: anId,
    handler: "王轮机",
    result: "检查油泵并复位，连续观察30分钟稳定",
    at: Date.now() + 3,
  });
  const done = s.anomalies.find((a) => a.id === anId);
  ok("处理后异常关闭且保留处理信息", done.status === "resolved" && done.handler === "王轮机" && done.result.includes("油泵"));
  // 已处理异常仍在列表（时间线）
  ok("已处理异常仍保留在数据中", s.anomalies.some((a) => a.id === anId));
}

// ---------- 6. 舱底水规则 ----------
{
  let s = reducer(s0, {
    type: "addReading",
    deviceId: "dev-bilge",
    values: { bilge: "near" },
    note: "",
    at: Date.now(),
  });
  ok("接近警戒线不产生异常", s.anomalies.filter((a) => a.deviceId === "dev-bilge" && a.status === "open").length === 0);

  s = reducer(s, {
    type: "addReading",
    deviceId: "dev-bilge",
    values: { bilge: "high" },
    note: "",
    at: Date.now() + 1,
  });
  const bilgeOpen = s.anomalies.filter((a) => a.deviceId === "dev-bilge" && a.status === "open");
  ok("高位报警产生严重异常", bilgeOpen.length === 1 && bilgeOpen[0].severity === "critical");
}

// ---------- 7. 交班摘要：按设备最严重 + 冻结 ----------
{
  const s1 = reducer(s0, { type: "closeShift", note: "交班测试", at: Date.now() });
  const sh3 = s1.shifts.find((s) => s.id === "sh-3");
  ok("交班生成快照", !!sh3.handover && sh3.status === "closed");
  // 进行中未完成：an-1 主机(warning), an-2 #2发电机(critical)
  const hosts = sh3.handover.entries;
  ok("交班摘要每设备最严重一条", hosts.length === 2);
  const gen = hosts.find((e) => e.deviceId === "dev-gen2");
  ok("#2发电机条目为严重", gen.anomaly.severity === "critical");
  ok("摘要条目是冻结快照含班次标签", gen.anomaly.openedShiftLabel === "08-12班");
  ok("摘要记录累计触发次数(an-2在本班又触发1次→3)", gen.anomaly.refCount === 3);

  // 交班后处理异常，摘要不变
  const s2 = reducer(s1, {
    type: "resolveAnomaly",
    anomalyId: "an-2",
    handler: "李轮机",
    result: "清洗冷却器，水温恢复",
    at: Date.now() + 10,
  });
  const sh3again = s2.shifts.find((s) => s.id === "sh-3");
  ok("交班后处理异常不改变摘要", sh3again.handover === sh3.handover);
  ok("交班后currentShiftId为空", s2.currentShiftId === null);

  // 未开班不能录入
  const s3 = reducer(s2, {
    type: "addReading",
    deviceId: "dev-main",
    values: { rpm: 1000 },
    note: "",
    at: Date.now(),
  });
  ok("无进行中班次不能录入", s3.readings.length === s2.readings.length);
}

// ---------- 8. worstOpenByDevice 选择最严重 ----------
{
  // 构造同一设备两条open：一条warning一条critical
  let s = reducer(s0, {
    type: "addReading",
    deviceId: "dev-pump",
    values: { rpm: 1210 }, // 范围800~1200，超10 → margin=40，warning
    note: "",
    at: Date.now(),
  });
  const pumpWarn = s.anomalies.find((a) => a.deviceId === "dev-pump" && a.status === "open");
  ok("泵组转速越限为警告", pumpWarn.severity === "warning");

  s = reducer(s, {
    type: "addInspection",
    deviceId: "dev-pump",
    severity: "critical",
    description: "泵组严重振动",
    at: Date.now() + 1,
  });
  const worst = worstOpenByDevice(s.anomalies).get("dev-pump");
  ok("同设备取最严重（巡检严重 > 转速警告）", worst.severity === "critical" && worst.description === "泵组严重振动");
}

// ---------- 9. 阈值修改留痕且仅影响新读数 ----------
{
  const s1 = reducer(s0, {
    type: "updateRanges",
    deviceId: "dev-main",
    ranges: { ...s0.ranges["dev-main"], rpm: { min: 50, max: 110 } },
    note: "测试调整",
    at: Date.now(),
  });
  const revs = s1.revisions
    .filter((r) => r.deviceId === "dev-main")
    .sort((a, b) => b.at - a.at);
  ok("阈值修订新增记录（初始+今早调整+本次=3）", revs.length === 3);
  ok("修订说明留痕", revs[0].note === "测试调整");
  // 历史读数状态值不变（对象未变）
  const old = s0.readings.find((r) => r.id === "rd-2");
  const now = s1.readings.find((r) => r.id === "rd-2");
  ok("阈值修改不回改历史读数对象", old.evaluations === now.evaluations);
}

console.log(`\n全部 ${pass} 项检查通过 ✅`);
