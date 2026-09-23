import type {
  Anomaly,
  AnomalySource,
  BilgeLevel,
  DeviceRanges,
  EvalStatus,
  Evaluation,
  FrozenAnomaly,
  HandoverEntry,
  HandoverSnapshot,
  ParamKey,
  ParamMeta,
  PersistState,
  Range,
  Reading,
  Severity,
  Shift,
} from "../types";

export const STORAGE_KEY = "hxyfront-62001-watch-state-v1";

export const PARAM_META: Record<ParamKey, ParamMeta> = {
  rpm: { key: "rpm", label: "主机转速", unit: "rpm", step: 1 },
  oilPressure: { key: "oilPressure", label: "滑油压力", unit: "MPa", step: 0.01 },
  coolantTemp: { key: "coolantTemp", label: "冷却水温", unit: "℃", step: 0.1 },
};

export const PARAM_KEYS = Object.keys(PARAM_META) as ParamKey[];

export const SEVERITY_RANK: Record<Severity, number> = { warning: 1, critical: 2 };

/** 紧急裕度：取安全区间宽度的 10%（下限侧至少 1 个录入步长） */
function marginOf(range: Range, step: number): number {
  return Math.max((range.max - range.min) * 0.1, step);
}

/**
 * 按给定的安全范围（录入当时的范围）判定读数。
 * 返回的 Evaluation 内嵌 range 快照，之后阈值调整不影响它。
 */
export function evaluate(param: ParamKey, value: number, range: Range): Evaluation {
  const meta = PARAM_META[param];
  let status: EvalStatus = "normal";
  let excess = 0;

  if (value < range.min) {
    excess = range.min - value;
    status = excess > marginOf(range, meta.step) ? "critical" : "warning";
  } else if (value > range.max) {
    excess = value - range.max;
    status = excess > marginOf(range, meta.step) ? "critical" : "warning";
  }

  return {
    param,
    value,
    range: { ...range },
    unit: meta.unit,
    status,
    excess: round(excess),
    margin: round(marginOf(range, meta.step)),
  };
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function evalText(ev: Evaluation): string {
  if (ev.status === "normal") return "在安全范围内";
  const direction = ev.value < ev.range.min ? "偏低" : "偏高";
  const limit = ev.value < ev.range.min ? ev.range.min : ev.range.max;
  return `${PARAM_META[ev.param].label}${direction} ${fmtValue(ev.value, ev.param)}${ev.unit}，限值${fmtValue(limit, ev.param)}${ev.unit}，超出 ${fmtValue(ev.excess, ev.param)}${ev.unit}`;
}

export function fmtValue(v: number, param?: ParamKey): string {
  if (param === "rpm") return String(Math.round(v));
  if (param === "oilPressure") return v.toFixed(2);
  if (param === "coolantTemp") return v.toFixed(1);
  return String(round(v));
}

export function bilgeText(level: BilgeLevel): string {
  return level === "high" ? "高位报警" : level === "near" ? "接近警戒线" : "正常";
}

export function bilgeSeverity(level: BilgeLevel): Severity | null {
  if (level === "high") return "critical";
  return null; // 接近警戒线只是预警，不生成异常
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtTimeShort(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function shiftLabelOf(state: PersistState, shiftId: string): string {
  return state.shifts.find((s) => s.id === shiftId)?.label ?? "历史班次";
}

/**
 * 从全部未完成异常中，按设备挑出最严重的一条。
 * 排序：严重程度（严重 > 警告）→ 越限量大 → 发生早。
 */
export function worstOpenByDevice(
  anomalies: Anomaly[]
): Map<string, Anomaly> {
  const map = new Map<string, Anomaly>();
  for (const a of anomalies) {
    if (a.status !== "open") continue;
    const cur = map.get(a.deviceId);
    if (!cur || worseThan(a, cur)) map.set(a.deviceId, a);
  }
  return map;
}

function worseThan(a: Anomaly, b: Anomaly): boolean {
  if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
    return SEVERITY_RANK[a.severity] > SEVERITY_RANK[b.severity];
  }
  const ea = a.refs[a.refs.length - 1] ? excessOf(a) : 0;
  const eb = b.refs[b.refs.length - 1] ? excessOf(b) : 0;
  if (ea !== eb) return ea > eb;
  return a.openedAt < b.openedAt;
}

function excessOf(a: Anomaly): number {
  if (a.value === undefined || !a.rangeSnapshot) return 0;
  if (a.value < a.rangeSnapshot.min) return a.rangeSnapshot.min - a.value;
  if (a.value > a.rangeSnapshot.max) return a.value - a.rangeSnapshot.max;
  return 0;
}

/**
 * 生成交班摘要快照。生成后异常即使后来被处理，快照内容也不再变化。
 */
export function buildHandover(
  state: PersistState,
  at: number,
  by: string,
  note: string
): HandoverSnapshot {
  const worst = worstOpenByDevice(state.anomalies);
  const entries: HandoverEntry[] = [];
  const deviceById = new Map(state.devices.map((d) => [d.id, d]));

  for (const deviceId of state.devices.map((d) => d.id)) {
    const a = worst.get(deviceId);
    if (!a) continue;
    entries.push({
      deviceId,
      deviceName: deviceById.get(deviceId)?.name ?? deviceId,
      anomaly: freezeAnomaly(a, shiftLabelOf(state, a.openedShiftId)),
    });
  }

  entries.sort((x, y) => {
    if (SEVERITY_RANK[y.anomaly.severity] !== SEVERITY_RANK[x.anomaly.severity]) {
      return SEVERITY_RANK[y.anomaly.severity] - SEVERITY_RANK[x.anomaly.severity];
    }
    return x.deviceName.localeCompare(y.deviceName, "zh");
  });

  const open = state.anomalies.filter((a) => a.status === "open");
  return {
    at,
    by,
    note,
    openCount: open.length,
    criticalCount: open.filter((a) => a.severity === "critical").length,
    entries,
  };
}

export function freezeAnomaly(a: Anomaly, openedShiftLabel: string): FrozenAnomaly {
  return {
    anomalyId: a.id,
    source: a.source,
    param: a.param,
    value: a.value,
    unit: a.unit,
    rangeSnapshot: a.rangeSnapshot ? { ...a.rangeSnapshot } : undefined,
    severity: a.severity,
    description: a.description,
    openedAt: a.openedAt,
    openedShiftLabel,
    refCount: a.refs.length,
  };
}

export function sourceLabel(source: AnomalySource): string {
  return source === "reading" ? "参数越限" : source === "bilge" ? "舱底水" : "巡检异常";
}

export function currentRangesFor(state: PersistState, deviceId: string): DeviceRanges {
  return state.ranges[deviceId] ?? {};
}

/** 按时间倒序合并读数时间线与巡检异常（巡检项不作为读数条目） */
export interface TimelineItem {
  kind: "reading" | "inspection";
  at: number;
  reading?: Reading;
  anomaly?: Anomaly;
}

export function buildTimeline(state: PersistState, deviceId: string | null): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of state.readings) {
    if (deviceId && r.deviceId !== deviceId) continue;
    items.push({ kind: "reading", at: r.at, reading: r });
  }
  for (const a of state.anomalies) {
    if (a.source !== "inspection") continue;
    if (deviceId && a.deviceId !== deviceId) continue;
    items.push({ kind: "inspection", at: a.openedAt, anomaly: a });
  }
  return items.sort((x, y) => y.at - x.at);
}

export function shiftOf(state: PersistState, shiftId: string): Shift | undefined {
  return state.shifts.find((s) => s.id === shiftId);
}
