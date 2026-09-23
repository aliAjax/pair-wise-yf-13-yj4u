// 船舶轮机值班记录 —— 数据模型

export type Role = "engineer" | "chief";

export type ParamKey = "rpm" | "oilPressure" | "coolantTemp";

/** 读数判定结果（normal 为正常，其余为越限等级） */
export type EvalStatus = "normal" | "warning" | "critical";
export type Severity = "warning" | "critical";

export type BilgeLevel = "normal" | "near" | "high";

export type AnomalySource = "reading" | "bilge" | "inspection";

export interface Range {
  min: number;
  max: number;
}

/** 每台设备适用参数的当前安全范围（只包含设备拥有的参数） */
export type DeviceRanges = Partial<Record<ParamKey, Range>>;

export interface Device {
  id: string;
  name: string;
  group: string;
  params: ParamKey[];
  bilge?: boolean;
}

export interface ParamMeta {
  key: ParamKey;
  label: string;
  unit: string;
  step: number;
}

/** 安全范围修订记录（轮机长每次调整都留痕） */
export interface ThresholdRevision {
  id: string;
  deviceId: string;
  ranges: DeviceRanges;
  by: string;
  at: number;
  note: string;
}

/**
 * 读数判定快照：range 是录入那一刻该设备的安全范围。
 * 阈值以后再改，这里的判定与范围都不变。
 */
export interface Evaluation {
  param: ParamKey;
  value: number;
  range: Range;
  unit: string;
  status: EvalStatus;
  /** 超出限值的量，正常时为 0 */
  excess: number;
  /** 紧急裕度：超出量大于它判“严重”，否则判“警告” */
  margin: number;
}

export interface ReadingValues {
  rpm?: number;
  oilPressure?: number;
  coolantTemp?: number;
  fuelConsumption?: number;
  bilge?: BilgeLevel;
}

/** 异常在时间线上的重复触发记录（读数恢复正常也不会关闭异常） */
export interface AnomalyRef {
  readingId: string;
  at: number;
  detail: string;
}

export interface Reading {
  id: string;
  shiftId: string;
  deviceId: string;
  at: number;
  by: string;
  values: ReadingValues;
  /** 按当时安全范围得到的判定快照 */
  evaluations: Evaluation[];
  anomalyIds: string[];
  note?: string;
}

export interface Anomaly {
  id: string;
  deviceId: string;
  source: AnomalySource;
  openedShiftId: string;
  openedAt: number;
  param?: ParamKey;
  value?: number;
  unit?: string;
  /** 产生异常时的安全范围快照 */
  rangeSnapshot?: Range;
  severity: Severity;
  description: string;
  refs: AnomalyRef[];
  status: "open" | "resolved";
  /** 以下三项必须齐备才算处理完成 */
  handler?: string;
  result?: string;
  resolvedAt?: number;
  resolvedShiftId?: string;
}

/** 交接时冻结进交班摘要的异常快照 */
export interface FrozenAnomaly {
  anomalyId: string;
  source: AnomalySource;
  param?: ParamKey;
  value?: number;
  unit?: string;
  rangeSnapshot?: Range;
  severity: Severity;
  description: string;
  openedAt: number;
  openedShiftLabel: string;
  refCount: number;
}

export interface HandoverEntry {
  deviceId: string;
  deviceName: string;
  anomaly: FrozenAnomaly;
}

/** 交班摘要：交班那一刻生成并随班次冻结 */
export interface HandoverSnapshot {
  at: number;
  by: string;
  note: string;
  openCount: number;
  criticalCount: number;
  /** 每台设备仅保留最严重的一条未完成异常 */
  entries: HandoverEntry[];
}

export interface Shift {
  id: string;
  label: string;
  startedAt: number;
  startedBy: string;
  status: "ongoing" | "closed";
  endedAt?: number;
  endedBy?: string;
  handover?: HandoverSnapshot;
}

export interface PersistState {
  version: 1;
  seq: number;
  role: Role;
  userName: string;
  devices: Device[];
  /** 每台设备的当前安全范围 */
  ranges: Record<string, DeviceRanges>;
  revisions: ThresholdRevision[];
  shifts: Shift[];
  currentShiftId: string | null;
  readings: Reading[];
  anomalies: Anomaly[];
}
