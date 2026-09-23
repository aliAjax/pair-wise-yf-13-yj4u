import type { Anomaly, AppData, Device, NumericMetric, Reading } from "../types";
import {
  describeJudgment,
  fmtTime,
  METRIC_META,
  SEVERITY_META,
  THRESHOLD_METRICS,
} from "../domain";

interface Props {
  data: AppData;
  deviceFilter: string;
  onLocate: (anomalyId: string) => void;
}

export function Dashboard({ data, deviceFilter, onLocate }: Props) {
  const devices = data.devices.filter(
    (d) => deviceFilter === "all" || d.id === deviceFilter
  );
  const latest = new Map<string, Reading>();
  for (const r of data.readings) {
    const key = `${r.deviceId}:${r.metric}`;
    const prev = latest.get(key);
    if (!prev || r.ts > prev.ts) latest.set(key, r);
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>机舱参数看板</p>
          <h2>设备实时状态</h2>
        </div>
        <span className="hint">状态依据读数录入当时的安全范围快照</span>
      </div>
      <div className="device-grid">
        {devices.map((d) => (
          <DeviceCard
            key={d.id}
            device={d}
            latest={latest}
            anomalies={data.anomalies}
            onLocate={onLocate}
          />
        ))}
      </div>
    </section>
  );
}

function DeviceCard({
  device,
  latest,
  anomalies,
  onLocate,
}: {
  device: Device;
  latest: Map<string, Reading>;
  anomalies: Anomaly[];
  onLocate: (id: string) => void;
}) {
  const open = anomalies.filter((a) => a.deviceId === device.id && a.status === "open");
  return (
    <article className={`device-card ${open.length ? "has-open" : ""}`}>
      <header>
        <div>
          <h3>{device.name}</h3>
          <small>{device.kind}</small>
        </div>
        <span className={`state-dot ${open.length ? "alarm" : "ok"}`}>
          {open.length ? `${open.length} 项未处理` : "正常"}
        </span>
      </header>

      <div className="metric-rows">
        {THRESHOLD_METRICS.filter((m) => device.ranges[m]).map((m) => {
          const r = latest.get(`${device.id}:${m}`);
          const openAnomaly = open.find((a) => a.metric === m);
          return (
            <MetricRow
              key={m}
              metric={m}
              reading={r}
              openAnomaly={openAnomaly}
              onLocate={onLocate}
            />
          );
        })}
      </div>
    </article>
  );
}

function MetricRow({
  metric,
  reading,
  openAnomaly,
  onLocate,
}: {
  metric: NumericMetric;
  reading?: Reading;
  openAnomaly?: Anomaly;
  onLocate: (id: string) => void;
}) {
  const meta = METRIC_META[metric];
  const alarm = reading?.judgment?.status === "alarm";
  // 关键规则：读数恢复后异常单仍在，显示“已恢复·待处理”
  const recovered = openAnomaly && !alarm;

  return (
    <div
      className={`metric-row ${openAnomaly ? "open" : ""} ${alarm ? "alarm" : ""}`}
      onClick={openAnomaly ? () => onLocate(openAnomaly.id) : undefined}
      role={openAnomaly ? "button" : undefined}
    >
      <span className="metric-label">{meta.label}</span>
      <span className="metric-value">
        {reading && reading.value !== null ? (
          <>
            <strong>{reading.value}</strong>
            <small>{meta.unit}</small>
          </>
        ) : (
          <small className="empty">本班未录</small>
        )}
      </span>
      <span className="metric-status">
        {openAnomaly ? (
          <span
            className="badge"
            style={{
              color: SEVERITY_META[openAnomaly.severity].color,
              background: SEVERITY_META[openAnomaly.severity].bg,
              borderColor: SEVERITY_META[openAnomaly.severity].border,
            }}
          >
            {recovered ? "已恢复·待处理" : `${SEVERITY_META[openAnomaly.severity].label}未处理`}
          </span>
        ) : reading?.judgment ? (
          <span className={`badge ${alarm ? "bad" : "good"}`}>
            {alarm ? describeJudgment(reading.judgment, metric) : "正常"}
          </span>
        ) : null}
        {reading && <small className="metric-time">{fmtTime(reading.ts)}</small>}
      </span>
    </div>
  );
}
