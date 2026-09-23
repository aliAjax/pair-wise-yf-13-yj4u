import { useEffect, useState } from "react";
import type { Anomaly, AppData, Device, Reading } from "../types";
import { fmtTime, METRIC_META, SEVERITY_META } from "../domain";

interface Props {
  data: AppData;
  deviceFilter: string;
  highlightId: string | null;
  onResolve: (anomalyId: string, handler: string, result: string) => void;
  readonly: boolean;
  activeShiftId: string;
}

type Row =
  | { kind: "anomaly"; ts: string; anomaly: Anomaly }
  | { kind: "reading"; ts: string; reading: Reading };

export function Timeline({
  data,
  deviceFilter,
  highlightId,
  onResolve,
  readonly,
  activeShiftId,
}: Props) {
  const deviceById = new Map(data.devices.map((d) => [d.id, d]));
  const shiftById = new Map(data.shifts.map((s) => [s.id, s]));
  const anomalies = data.anomalies.filter(
    (a) => deviceFilter === "all" || a.deviceId === deviceFilter
  );
  const readings = data.readings.filter(
    (r) => deviceFilter === "all" || r.deviceId === deviceFilter
  );

  const rows: Row[] = [
    ...anomalies.map<Row>((a) => ({ kind: "anomaly", ts: a.openedAt, anomaly: a })),
    ...readings.map<Row>((r) => ({ kind: "reading", ts: r.ts, reading: r })),
  ].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  return (
    <section className="panel" id="timeline-panel">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>异常单与读数记录</h2>
        </div>
        <span className="hint">越限即开单；读数恢复不会自动关单，须登记处理人与处理结果</span>
      </div>

      <div className="timeline">
        {rows.map((row) =>
          row.kind === "anomaly" ? (
            <AnomalyItem
              key={row.anomaly.id}
              anomaly={row.anomaly}
              device={deviceById.get(row.anomaly.deviceId)}
              shiftLabel={shiftById.get(row.anomaly.openedShiftId)?.slot ?? ""}
              inActiveShift={row.anomaly.openedShiftId === activeShiftId}
              readingCount={row.anomaly.readingIds.length}
              highlight={highlightId === row.anomaly.id}
              readonly={readonly}
              onResolve={onResolve}
            />
          ) : (
            <ReadingItem
              key={row.reading.id}
              reading={row.reading}
              device={deviceById.get(row.reading.deviceId)}
              shiftLabel={shiftById.get(row.reading.shiftId)?.slot ?? ""}
              inActiveShift={row.reading.shiftId === activeShiftId}
            />
          )
        )}
        {rows.length === 0 && <p className="empty-state">该设备暂无记录</p>}
      </div>
    </section>
  );
}

function AnomalyItem({
  anomaly,
  device,
  shiftLabel,
  inActiveShift,
  readingCount,
  highlight,
  readonly,
  onResolve,
}: {
  anomaly: Anomaly;
  device?: Device;
  shiftLabel: string;
  inActiveShift: boolean;
  readingCount: number;
  highlight: boolean;
  readonly: boolean;
  onResolve: (id: string, handler: string, result: string) => void;
}) {
  const [open, setOpen] = useState(highlight);
  const [handler, setHandler] = useState("");
  const [result, setResult] = useState("");
  const sev = SEVERITY_META[anomaly.severity];

  useEffect(() => {
    if (highlight) setOpen(true);
  }, [highlight]);

  return (
    <div
      className={`tl-item anomaly ${anomaly.status} ${highlight ? "highlight" : ""} ${
        inActiveShift ? "" : "other-shift"
      }`}
      style={{ borderLeftColor: sev.border }}
    >
      <div className="tl-dot" style={{ background: sev.border }} />
      <div className="tl-body">
        <div className="tl-head">
          <span
            className="badge"
            style={{ color: sev.color, background: sev.bg, borderColor: sev.border }}
          >
            {sev.label}
          </span>
          <h3>{anomaly.title}</h3>
          <span className="badge status">{anomaly.status === "open" ? "未处理" : "已处理"}</span>
          {!inActiveShift && <span className="badge shift-tag">开出班次 {shiftLabel}</span>}
          <time>{fmtTime(anomaly.openedAt)}</time>
        </div>
        <p className="tl-desc">
          <b>{device?.name ?? anomaly.deviceId}</b> · {anomaly.description}
          <span className="tl-meta">
            开出人 {anomaly.openedBy} · 已并入 {readingCount} 条越限读数
          </span>
        </p>

        {anomaly.status === "resolved" && anomaly.resolution && (
          <div className="resolution">
            <p>
              <b>处理人：</b>
              {anomaly.resolution.handler}
              <span className="tl-meta"> 处理时间 {fmtTime(anomaly.resolution.ts)}</span>
            </p>
            <p>
              <b>处理结果：</b>
              {anomaly.resolution.result}
            </p>
          </div>
        )}

        {anomaly.status === "open" && !readonly && (
          <button className="link-btn" onClick={() => setOpen((v) => !v)}>
            {open ? "收起处理登记" : "登记处理结果（读数恢复也需处理）"}
          </button>
        )}
        {anomaly.status === "open" && readonly && (
          <p className="hint">
            正在查看已交班班次（只读）。未处理异常不随交班消失，请切回当前班次进行处理登记。
          </p>
        )}

        {open && anomaly.status === "open" && !readonly && (
          <div className="resolve-box">
            <label>
              <span>处理人 *</span>
              <input
                value={handler}
                placeholder="填写处理人姓名"
                onChange={(e) => setHandler(e.target.value)}
              />
            </label>
            <label>
              <span>处理结果 *</span>
              <input
                value={result}
                placeholder="例如：换新滑油泵、恢复正常温度并复查"
                onChange={(e) => setResult(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={!handler.trim() || !result.trim()}
              onClick={() => {
                onResolve(anomaly.id, handler, result);
                setOpen(false);
              }}
            >
              确认处理并归档（异常保留在时间线）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadingItem({
  reading,
  device,
  shiftLabel,
  inActiveShift,
}: {
  reading: Reading;
  device?: Device;
  shiftLabel: string;
  inActiveShift: boolean;
}) {
  const alarm = reading.judgment?.status === "alarm";
  const meta = METRIC_META[reading.metric];
  return (
    <div
      className={`tl-item reading ${alarm ? "alarm" : ""} ${inActiveShift ? "" : "other-shift"}`}
    >
      <div className={`tl-dot ${alarm ? "alarm" : "ok"}`} />
      <div className="tl-body">
        <div className="tl-head compact">
          <span className={`badge ${alarm ? "bad" : "good"}`}>
            {reading.judgment ? (alarm ? "越限" : "正常") : "记录"}
          </span>
          <h3>
            {device?.name} · {meta.label}
          </h3>
          {!inActiveShift && <span className="badge shift-tag">{shiftLabel}</span>}
          <time>{fmtTime(reading.ts)}</time>
        </div>
        <p className="tl-desc">
          {reading.value !== null && (
            <>
              读数 <b>{reading.value}</b> {meta.unit}
            </>
          )}
          {reading.text && <span>{reading.text}</span>}
          <span className="tl-meta">
            录入人 {reading.operator || "未署名"}
            {reading.judgment?.range &&
              ` · 当时范围 ${reading.judgment.range.min}~${reading.judgment.range.max}${meta.unit}`}
            {reading.anomalyId ? " · 已并入异常单" : ""}
          </span>
        </p>
      </div>
    </div>
  );
}
