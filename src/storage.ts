import type { AppData, Device, NumericMetric } from "./types";
import { METRIC_META } from "./domain";

const STORE_KEY = "engine-watch-data-v1";

export function defaultDevices(): Device[] {
  return [
    {
      id: "main-engine",
      name: "主机",
      kind: "主机",
      ranges: {
        rpm: { min: 70, max: 90 },
        oil: { min: 0.35, max: 0.5 },
        coolant: { min: 70, max: 85 },
      },
    },
    {
      id: "gen-1",
      name: "1号发电机",
      kind: "发电机",
      ranges: {
        rpm: { min: 1450, max: 1550 },
        oil: { min: 0.3, max: 0.55 },
        coolant: { min: 65, max: 90 },
      },
    },
    {
      id: "gen-2",
      name: "2号发电机",
      kind: "发电机",
      ranges: {
        rpm: { min: 1450, max: 1550 },
        oil: { min: 0.3, max: 0.55 },
        coolant: { min: 65, max: 90 },
      },
    },
    {
      id: "pump-group",
      name: "海水泵组",
      kind: "泵组",
      ranges: {
        oil: { min: 0.2, max: 0.45 },
        coolant: { min: 40, max: 75 },
      },
    },
    {
      id: "bilge",
      name: "舱底水系统",
      kind: "舱底水",
      ranges: {},
    },
  ];
}

export function seedData(): AppData {
  const devices = defaultDevices();
  const t = (minutesAgo: number) =>
    new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const shift = {
    id: "shift-seed",
    label: "今日 08:00–12:00",
    slot: "08-12班",
    date: new Date().toISOString().slice(0, 10),
    status: "open" as const,
    openedAt: t(200),
  };
  return {
    version: 1,
    devices,
    shifts: [shift],
    activeShiftId: shift.id,
    readings: [
      {
        id: "r-seed-1",
        shiftId: shift.id,
        deviceId: "main-engine",
        metric: "rpm",
        value: 82,
        text: null,
        operator: "李轮机",
        ts: t(180),
        judgment: { status: "normal", range: devices[0].ranges.rpm! },
      },
      {
        id: "r-seed-2",
        shiftId: shift.id,
        deviceId: "main-engine",
        metric: "oil",
        value: 0.42,
        text: null,
        operator: "李轮机",
        ts: t(180),
        judgment: { status: "normal", range: devices[0].ranges.oil! },
      },
      {
        id: "r-seed-3",
        shiftId: shift.id,
        deviceId: "gen-2",
        metric: "coolant",
        value: 96,
        text: null,
        operator: "王机工",
        ts: t(95),
        judgment: {
          status: "alarm",
          range: devices[2].ranges.coolant!,
          direction: "high",
          severity: "major",
        },
        anomalyId: "a-seed-1",
      },
      {
        id: "r-seed-4",
        shiftId: shift.id,
        deviceId: "gen-2",
        metric: "coolant",
        value: 84,
        text: null,
        operator: "王机工",
        ts: t(30),
        judgment: { status: "normal", range: devices[2].ranges.coolant! },
      },
      {
        id: "r-seed-5",
        shiftId: shift.id,
        deviceId: "bilge",
        metric: "bilge",
        value: null,
        text: "液位接近警戒线，已加密观察",
        operator: "王机工",
        ts: t(60),
        judgment: null,
      },
    ],
    anomalies: [
      {
        id: "a-seed-1",
        deviceId: "gen-2",
        metric: "coolant",
        severity: "major",
        title: `${METRIC_META.coolant.label}越限`,
        description: "读数 96℃，高于安全范围 65~90℃",
        openedShiftId: shift.id,
        openedAt: t(95),
        openedBy: "王机工",
        readingIds: ["r-seed-3"],
        status: "open",
      },
    ],
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // 存储损坏时回退到初始数据
  }
  const seeded = seedData();
  saveData(seeded);
  return seeded;
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

export function resetData(): AppData {
  const seeded = seedData();
  saveData(seeded);
  return seeded;
}
