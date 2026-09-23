export type NumericMetric = "rpm" | "oil" | "coolant";
export type Metric = NumericMetric | "fuel" | "bilge" | "inspection";
export type Severity = "minor" | "major" | "critical";

export type DeviceId = string;

export interface Device {
  id: DeviceId;
  name: string;
  kind: string;
  /** 该设备需要监测的三项安全参数范围；key 缺失表示该设备不监测此项 */
  ranges: Partial<Record<NumericMetric, Range>>;
}

export interface Range {
  min: number;
  max: number;
}

export interface Reading {
  id: string;
  shiftId: string;
  deviceId: DeviceId;
  metric: Metric;
  /** 数值型参数（含燃油消耗）的读数 */
  value: number | null;
  /** 舱底水状态 / 巡检描述等文本 */
  text: string | null;
  /** 录入人 */
  operator: string;
  ts: string;
  /**
   * 判定快照：按录入当时该设备的安全范围得出，
   * 阈值日后修改不影响已保存的判定。
   */
  judgment: Judgment | null;
  /** 若该次录入触发或并入了异常，记录其 id */
  anomalyId?: string;
}

export interface Judgment {
  status: "normal" | "alarm";
  severity?: Severity;
  range: Range | null;
  /** 越限方向，便于摘要说明 */
  direction?: "high" | "low";
}

export type AnomalyStatus = "open" | "resolved";

export interface Resolution {
  handler: string;
  result: string;
  ts: string;
}

export interface Anomaly {
  id: string;
  deviceId: DeviceId;
  metric: Metric;
  severity: Severity;
  title: string;
  description: string;
  openedShiftId: string;
  openedAt: string;
  openedBy: string;
  /** 触发异常的读数（及并入同一异常单的后续越限读数）id */
  readingIds: string[];
  status: AnomalyStatus;
  resolution?: Resolution;
}

export interface Shift {
  id: string;
  label: string;
  slot: string;
  date: string;
  status: "open" | "closed";
  openedAt: string;
  handover?: Handover;
}

export interface HandoverItem {
  deviceId: DeviceId;
  deviceName: string;
  anomalyId: string;
  metric: Metric;
  severity: Severity;
  title: string;
  openedAt: string;
}

export interface Handover {
  ts: string;
  fromOperator: string;
  /** 交班时刻按设备冻结的“最严重的一条未完成异常” */
  items: HandoverItem[];
  note: string;
}

export interface AppData {
  version: 1;
  devices: Device[];
  shifts: Shift[];
  readings: Reading[];
  anomalies: Anomaly[];
  activeShiftId: string;
}
