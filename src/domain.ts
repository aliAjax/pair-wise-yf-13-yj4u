import type {
  Anomaly,
  Device,
  HandoverItem,
  Judgment,
  Metric,
  NumericMetric,
  Reading,
  Severity,
} from "./types";

export const METRIC_META: Record<
  Metric,
  { label: string; unit: string; numeric: boolean }
> = {
  rpm: { label: "主机转速", unit: "rpm", numeric: true },
  oil: { label: "滑油压力", unit: "MPa", numeric: true },
  coolant: { label: "冷却水温", unit: "℃", numeric: true },
  fuel: { label: "燃油消耗", unit: "L", numeric: true },
  bilge: { label: "舱底水状态", unit: "", numeric: false },
  inspection: { label: "异常巡检项", unit: "", numeric: false },
};

/** 受安全阈值管控的三项参数，轮机长可按设备调整 */
export const THRESHOLD_METRICS: NumericMetric[] = ["rpm", "oil", "coolant"];

export const SEVERITY_META: Record<
  Severity,
  { label: string; rank: number; color: string; bg: string; border: string }
> = {
  minor: { label: "一般", rank: 1, color: "#92400e", bg: "#fef3c7", border: "#f59e0b" },
  major: { label: "严重", rank: 2, color: "#9a3412", bg: "#ffedd5", border: "#f97316" },
  critical: { label: "危急", rank: 3, color: "#991b1b", bg: "#fee2e2", border: "#dc2626" },
};

/** 越限幅度超过安全范围宽度 20% 升级为危急；其余越限为严重 */
export function evaluate(
  metric: Metric,
  value: number | null,
  device: Device
): Judgment {
  if (metric !== "rpm" && metric !== "oil" && metric !== "coolant") {
    return { status: "normal", range: null };
  }
  const range = device.ranges[metric as NumericMetric] ?? null;
  if (value === null || !range) return { status: "normal", range };

  if (value < range.min) {
    return {
      status: "alarm",
      range,
      direction: "low",
      severity: gradeSeverity(value, range),
    };
  }
  if (value > range.max) {
    return {
      status: "alarm",
      range,
      direction: "high",
      severity: gradeSeverity(value, range),
    };
  }
  return { status: "normal", range };
}

function gradeSeverity(value: number, range: { min: number; max: number }): Severity {
  const width = Math.max(range.max - range.min, 1e-9);
  const over = value > range.max ? value - range.max : range.min - value;
  return over / width > 0.2 ? "critical" : "major";
}

export function describeJudgment(j: Judgment, metric: Metric): string {
  if (j.status === "normal") return "在安全范围内";
  const meta = METRIC_META[metric];
  const r = j.range;
  const rangeText = r ? `安全范围 ${r.min}~${r.max}${meta.unit}` : "未配置安全范围";
  return `${j.direction === "high" ? "高于" : "低于"}安全范围（${rangeText}）`;
}

/**
 * 找该设备+参数当前未关闭的异常单：越界后读数即使恢复，
 * 异常仍留在时间线，后续同参数越限并入同一单而不是自动关闭。
 */
export function findOpenAnomaly(
  anomalies: Anomaly[],
  deviceId: string,
  metric: Metric
): Anomaly | undefined {
  return anomalies.find(
    (a) => a.deviceId === deviceId && a.metric === metric && a.status === "open"
  );
}

/**
 * 交班摘要：按设备列出最严重的一条未完成异常（危急 > 严重 > 一般），
 * 同严重度取最早开出的一条。调用结果在交班时冻结进班次。
 */
export function buildHandoverItems(
  anomalies: Anomaly[],
  devices: Device[]
): HandoverItem[] {
  const deviceName = new Map(devices.map((d) => [d.id, d.name]));
  const worst = new Map<string, Anomaly>();
  for (const a of anomalies) {
    if (a.status !== "open") continue;
    const current = worst.get(a.deviceId);
    if (
      !current ||
      SEVERITY_META[a.severity].rank > SEVERITY_META[current.severity].rank ||
      (SEVERITY_META[a.severity].rank === SEVERITY_META[current.severity].rank &&
        a.openedAt < current.openedAt)
    ) {
      worst.set(a.deviceId, a);
    }
  }
  return [...worst.values()]
    .sort((x, y) => deviceName.get(x.deviceId)!.localeCompare(deviceName.get(y.deviceId)!, "zh"))
    .map((a) => ({
      deviceId: a.deviceId,
      deviceName: deviceName.get(a.deviceId) ?? a.deviceId,
      anomalyId: a.id,
      metric: a.metric,
      severity: a.severity,
      title: a.title,
      openedAt: a.openedAt,
    }));
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowTs(): string {
  return new Date().toISOString();
}

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
