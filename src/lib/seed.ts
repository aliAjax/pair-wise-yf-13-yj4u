import type {
  Anomaly,
  Device,
  FrozenAnomaly,
  PersistState,
  Reading,
  ReadingValues,
  Shift,
  ThresholdRevision,
} from "../types";
import { PARAM_META, bilgeText, evaluate, freezeAnomaly } from "./domain";

/**
 * 演示数据时间线：
 * 昨天 08-12 班：主机转速越限（读数恢复后异常仍未关闭）、#2 发电机水温严重越限、
 *                舱底水高位报警（本班次后处理）、巡检渗漏（已处理）。
 * 昨天 12-16 班：处理完舱底水异常并交班；主机 / 发电机异常延续。
 * 今天 07:45  ：张轮机长调整主机转速与#2发电机水温安全范围。
 * 今天 08-12 班（进行中）：新读数按新范围判定，但历史判定与交班摘要保持不变。
 */

function atBase(daysAgo: number, h: number, m: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const devices: Device[] = [
  { id: "dev-main", name: "主机", group: "主机", params: ["rpm", "oilPressure", "coolantTemp"] },
  { id: "dev-gen2", name: "发电机#2", group: "发电机", params: ["rpm", "coolantTemp"] },
  { id: "dev-pump", name: "主机海水泵", group: "泵组", params: ["rpm", "oilPressure"] },
  { id: "dev-bilge", name: "舱底水", group: "舱底水", params: [], bilge: true },
];

type InitialRanges = Record<string, PersistState["ranges"][string]>;

const initialRanges: InitialRanges = {
  "dev-main": {
    rpm: { min: 60, max: 95 },
    oilPressure: { min: 0.3, max: 0.5 },
    coolantTemp: { min: 60, max: 85 },
  },
  "dev-gen2": {
    rpm: { min: 1450, max: 1550 },
    coolantTemp: { min: 40, max: 85 },
  },
  "dev-pump": {
    rpm: { min: 800, max: 1200 },
    oilPressure: { min: 0.2, max: 0.4 },
  },
  "dev-bilge": {},
};

function makeReading(
  id: string,
  shiftId: string,
  deviceId: string,
  ts: number,
  by: string,
  values: ReadingValues,
  ranges: InitialRanges[string],
  anomalyIds: string[] = [],
  note?: string
): Reading {
  const evaluations = (["rpm", "oilPressure", "coolantTemp"] as const)
    .filter((p) => values[p] !== undefined && ranges[p])
    .map((p) => evaluate(p, values[p] as number, ranges[p]!));
  return { id, shiftId, deviceId, at: ts, by, values, evaluations, anomalyIds, note };
}

export function makeSeedState(): PersistState {
  const rev0At = atBase(1, 7, 30);
  const s1Start = atBase(1, 8, 0);
  const s1End = atBase(1, 12, 0);
  const s2End = atBase(1, 16, 0);
  const reviseAt = atBase(0, 7, 45);
  const s3Start = atBase(0, 8, 0);

  const revisions: ThresholdRevision[] = [
    { id: "rv-main-0", deviceId: "dev-main", ranges: initialRanges["dev-main"], by: "张轮机长", at: rev0At, note: "初始安全范围" },
    { id: "rv-gen2-0", deviceId: "dev-gen2", ranges: initialRanges["dev-gen2"], by: "张轮机长", at: rev0At, note: "初始安全范围" },
    { id: "rv-pump-0", deviceId: "dev-pump", ranges: initialRanges["dev-pump"], by: "张轮机长", at: rev0At, note: "初始安全范围" },
    { id: "rv-bilge-0", deviceId: "dev-bilge", ranges: {}, by: "张轮机长", at: rev0At, note: "初始安全范围" },
    {
      id: "rv-main-1",
      deviceId: "dev-main",
      ranges: {
        rpm: { min: 55, max: 100 },
        oilPressure: { min: 0.3, max: 0.5 },
        coolantTemp: { min: 60, max: 85 },
      },
      by: "张轮机长",
      at: reviseAt,
      note: "主机工况调整：放宽转速上限并下调下限",
    },
    {
      id: "rv-gen2-1",
      deviceId: "dev-gen2",
      ranges: { rpm: { min: 1450, max: 1550 }, coolantTemp: { min: 45, max: 88 } },
      by: "张轮机长",
      at: reviseAt,
      note: "#2发电机冷却器清洗后上调水温上限",
    },
  ];

  // ---- 昨天 08-12 班读数（全部按当时的旧范围判定）----
  const rd1 = makeReading("rd-1", "sh-1", "dev-main", atBase(1, 8, 15), "王轮机", {
    rpm: 82, oilPressure: 0.42, coolantTemp: 68, fuelConsumption: 31,
  }, initialRanges["dev-main"]);

  const rd2 = makeReading("rd-2", "sh-1", "dev-main", atBase(1, 9, 40), "王轮机", {
    rpm: 96, oilPressure: 0.41, coolantTemp: 70, fuelConsumption: 30,
  }, initialRanges["dev-main"], ["an-1"]);

  const rd3 = makeReading("rd-3", "sh-1", "dev-main", atBase(1, 10, 30), "王轮机", {
    rpm: 84, oilPressure: 0.4, coolantTemp: 71, fuelConsumption: 30,
  }, initialRanges["dev-main"], [], "转速已恢复，继续观察");

  const rd4 = makeReading("rd-4", "sh-1", "dev-gen2", atBase(1, 9, 0), "王轮机", {
    rpm: 1500, coolantTemp: 91,
  }, initialRanges["dev-gen2"], ["an-2"]);

  const rd5 = makeReading("rd-5", "sh-1", "dev-gen2", atBase(1, 10, 0), "王轮机", {
    rpm: 1490, coolantTemp: 86.2,
  }, initialRanges["dev-gen2"], ["an-2"]);

  const rd6 = makeReading("rd-6", "sh-1", "dev-bilge", atBase(1, 11, 0), "王轮机", {
    bilge: "near",
  }, initialRanges["dev-bilge"], [], "液位接近警戒线，已加密观察");

  const rd7 = makeReading("rd-7", "sh-1", "dev-bilge", atBase(1, 11, 40), "王轮机", {
    bilge: "high",
  }, initialRanges["dev-bilge"], ["an-3"]);

  // ---- 昨天 12-16 班读数 ----
  const rd8 = makeReading("rd-8", "sh-2", "dev-main", atBase(1, 12, 20), "李轮机", {
    rpm: 86, oilPressure: 0.41, coolantTemp: 69, fuelConsumption: 29,
  }, initialRanges["dev-main"]);

  const rd9 = makeReading("rd-9", "sh-2", "dev-gen2", atBase(1, 12, 40), "李轮机", {
    rpm: 1495, coolantTemp: 83,
  }, initialRanges["dev-gen2"]);

  const rd10 = makeReading("rd-10", "sh-2", "dev-bilge", atBase(1, 13, 20), "李轮机", {
    bilge: "normal",
  }, initialRanges["dev-bilge"]);

  const rd11 = makeReading("rd-11", "sh-2", "dev-pump", atBase(1, 13, 40), "李轮机", {
    rpm: 960, oilPressure: 0.28,
  }, initialRanges["dev-pump"]);

  // ---- 今天 08-12 班（进行中）：按新范围判定 ----
  const newMain = revisions[4].ranges;
  const newGen2 = revisions[5].ranges;

  const rd12 = makeReading("rd-12", "sh-3", "dev-main", atBase(0, 8, 10), "王轮机", {
    rpm: 98.5, oilPressure: 0.4, coolantTemp: 72, fuelConsumption: 32,
  }, newMain);

  const rd13 = makeReading("rd-13", "sh-3", "dev-gen2", atBase(0, 8, 30), "王轮机", {
    rpm: 1505, coolantTemp: 89.5,
  }, newGen2, ["an-2"], "按新范围仍越限，并入既有水温异常");

  const rd14 = makeReading("rd-14", "sh-3", "dev-bilge", atBase(0, 9, 10), "王轮机", {
    bilge: "near",
  }, {});

  const readings: Reading[] = [rd1, rd2, rd3, rd4, rd5, rd6, rd7, rd8, rd9, rd10, rd11, rd12, rd13, rd14];

  // ---- 异常 ----
  const evRpm96 = rd2.evaluations[0];
  const evTemp91 = rd4.evaluations[1];
  const evTemp86 = rd5.evaluations[1];
  const evTemp89 = rd13.evaluations[1];

  const an1: Anomaly = {
    id: "an-1",
    deviceId: "dev-main",
    source: "reading",
    openedShiftId: "sh-1",
    openedAt: rd2.at,
    param: "rpm",
    value: 96,
    unit: PARAM_META.rpm.unit,
    rangeSnapshot: { ...evRpm96.range },
    severity: "warning",
    description: `主机转速越限：${evRpm96.range.min}~${evRpm96.range.max}rpm 之外`,
    refs: [{ readingId: rd2.id, at: rd2.at, detail: formatEval(rd2, "rpm") }],
    status: "open",
  };

  const an2: Anomaly = {
    id: "an-2",
    deviceId: "dev-gen2",
    source: "reading",
    openedShiftId: "sh-1",
    openedAt: rd4.at,
    param: "coolantTemp",
    value: 91,
    unit: PARAM_META.coolantTemp.unit,
    rangeSnapshot: { ...evTemp91.range },
    severity: "critical",
    description: `冷却水温严重越限：${evTemp91.range.min}~${evTemp91.range.max}℃ 之外`,
    refs: [
      { readingId: rd4.id, at: rd4.at, detail: formatEval(rd4, "coolantTemp") },
      { readingId: rd5.id, at: rd5.at, detail: formatEval(rd5, "coolantTemp") },
      { readingId: rd13.id, at: rd13.at, detail: formatEval(rd13, "coolantTemp") },
    ],
    status: "open",
  };

  const an3: Anomaly = {
    id: "an-3",
    deviceId: "dev-bilge",
    source: "bilge",
    openedShiftId: "sh-1",
    openedAt: rd7.at,
    severity: "critical",
    description: "舱底水高位报警",
    refs: [{ readingId: rd7.id, at: rd7.at, detail: bilgeText("high") }],
    status: "resolved",
    handler: "李轮机",
    result: "启动备用舱底泵排水，13:10 液位恢复正常并复核低位报警试验正常",
    resolvedAt: atBase(1, 13, 10),
    resolvedShiftId: "sh-2",
  };

  const an4: Anomaly = {
    id: "an-4",
    deviceId: "dev-pump",
    source: "inspection",
    openedShiftId: "sh-1",
    openedAt: atBase(1, 11, 20),
    severity: "warning",
    description: "主机海水泵出口法兰轻微渗漏",
    refs: [],
    status: "resolved",
    handler: "王轮机",
    result: "紧固法兰螺栓并复查，无渗漏，垫片已列入下次保养更换",
    resolvedAt: atBase(1, 11, 58),
    resolvedShiftId: "sh-1",
  };

  const anomalies: Anomaly[] = [an1, an2, an3, an4];

  // ---- 交班摘要（手工冻结，反映交班当时状态）----
  const frozen = (a: Anomaly, refCount: number, openedShiftLabel: string): FrozenAnomaly => {
    const f = freezeAnomaly(a, openedShiftLabel);
    return { ...f, refCount };
  };

  const shift1: Shift = {
    id: "sh-1",
    label: "08-12班",
    startedAt: s1Start,
    startedBy: "王轮机",
    status: "closed",
    endedAt: s1End,
    endedBy: "王轮机",
    handover: {
      at: s1End,
      by: "王轮机",
      note: "舱底水高位报警待排水复查；#2发电机水温严重越限持续观察；主机转速越限一次后读数恢复。",
      openCount: 3,
      criticalCount: 2,
      entries: [
        { deviceId: "dev-gen2", deviceName: "发电机#2", anomaly: frozen(an2, 2, "08-12班") },
        { deviceId: "dev-bilge", deviceName: "舱底水", anomaly: frozen(an3, 1, "08-12班") },
        { deviceId: "dev-main", deviceName: "主机", anomaly: frozen(an1, 1, "08-12班") },
      ],
    },
  };

  const shift2: Shift = {
    id: "sh-2",
    label: "12-16班",
    startedAt: s1End,
    startedBy: "李轮机",
    status: "closed",
    endedAt: s2End,
    endedBy: "李轮机",
    handover: {
      at: s2End,
      by: "李轮机",
      note: "舱底水异常已处理完毕；主机转速与#2发电机水温异常继续跟踪，读数暂正常但异常未关闭。",
      openCount: 2,
      criticalCount: 1,
      entries: [
        { deviceId: "dev-gen2", deviceName: "发电机#2", anomaly: frozen(an2, 2, "08-12班") },
        { deviceId: "dev-main", deviceName: "主机", anomaly: frozen(an1, 1, "08-12班") },
      ],
    },
  };

  const shift3: Shift = {
    id: "sh-3",
    label: "08-12班",
    startedAt: s3Start,
    startedBy: "王轮机",
    status: "ongoing",
  };

  return {
    version: 1,
    seq: 100,
    role: "chief",
    userName: "张轮机长",
    devices,
    ranges: {
      "dev-main": newMain,
      "dev-gen2": newGen2,
      "dev-pump": initialRanges["dev-pump"],
      "dev-bilge": {},
    },
    revisions,
    shifts: [shift1, shift2, shift3],
    currentShiftId: "sh-3",
    readings,
    anomalies,
  };
}

function formatEval(reading: Reading, param: "rpm" | "oilPressure" | "coolantTemp"): string {
  const ev = reading.evaluations.find((e) => e.param === param);
  if (!ev) return "";
  if (ev.status === "normal") {
    return `${PARAM_META[param].label} ${ev.value}${ev.unit}，恢复在安全范围 ${ev.range.min}~${ev.range.max}${ev.unit} 内`;
  }
  const dir = ev.value < ev.range.min ? "偏低" : "偏高";
  const limit = ev.value < ev.range.min ? ev.range.min : ev.range.max;
  return `${PARAM_META[param].label}${dir} ${ev.value}${ev.unit}，当时限值 ${limit}${ev.unit}，超出 ${ev.excess}${ev.unit}`;
}
