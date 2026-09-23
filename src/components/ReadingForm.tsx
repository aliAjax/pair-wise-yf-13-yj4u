import { useEffect, useMemo, useState } from "react";
import type { Device, Metric, Severity, Shift } from "../types";
import { evaluate, METRIC_META, THRESHOLD_METRICS } from "../domain";
import type { NewReadingInput } from "../store";

interface Props {
  devices: Device[];
  shift?: Shift;
  defaultOperator: string;
  onSubmit: (input: NewReadingInput) => void;
}

const ALL_METRICS: Metric[] = ["rpm", "oil", "coolant", "fuel", "bilge", "inspection"];
const SEVERITIES: Severity[] = ["minor", "major", "critical"];
const SEVERITY_LABEL: Record<Severity, string> = {
  minor: "一般",
  major: "严重",
  critical: "危急",
};

export function ReadingForm({ devices, shift, defaultOperator, onSubmit }: Props) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [metric, setMetric] = useState<Metric>("rpm");
  const [value, setValue] = useState("");
  const [text, setText] = useState("");
  const [operator, setOperator] = useState(defaultOperator);
  const [manualAlarm, setManualAlarm] = useState(false);
  const [severity, setSeverity] = useState<Severity>("minor");

  const device = devices.find((d) => d.id === deviceId);
  const numeric = METRIC_META[metric].numeric;
  const threshold = THRESHOLD_METRICS.includes(metric as (typeof THRESHOLD_METRICS)[number]);

  const availableMetrics = useMemo(() => {
    if (!device) return ALL_METRICS;
    return ALL_METRICS.filter(
      (m) =>
        !THRESHOLD_METRICS.includes(m as (typeof THRESHOLD_METRICS)[number]) ||
        device.ranges[m as "rpm"]
    );
  }, [device]);

  const preview = useMemo(() => {
    if (!device || !threshold || value.trim() === "") return null;
    const v = Number(value);
    if (Number.isNaN(v)) return null;
    return evaluate(metric, v, device);
  }, [device, metric, threshold, value]);

  // 设备切换后若当前参数该设备不监测（如舱底水无转速），回退到第一个可选项
  useEffect(() => {
    if (device && !availableMetrics.includes(metric)) {
      setMetric(availableMetrics[0] ?? "inspection");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  if (!shift) return null;
  const closed = shift.status === "closed";

  const submit = () => {
    if (closed) return;
    if (!device) return;
    const v = numeric ? Number(value) : null;
    const t = numeric ? null : text.trim();
    if (numeric && (Number.isNaN(v) || value.trim() === "")) return;
    if (!numeric && !t) return;
    if (!operator.trim()) return;
    if (manualAlarm && !numeric && !t) return;
    onSubmit({
      deviceId,
      metric,
      value: v,
      text: t,
      operator: operator.trim(),
      manualAlarm,
      severity,
    });
    setValue("");
    setText("");
    setManualAlarm(false);
  };

  const rangeText =
    device && threshold
      ? device.ranges[metric as "rpm"]
        ? `当前安全范围 ${device.ranges[metric as "rpm"]!.min} ~ ${
            device.ranges[metric as "rpm"]!.max
          } ${METRIC_META[metric].unit}（按录入时范围判定）`
        : "该设备未配置此项安全范围"
      : null;

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>轮机员录入</p>
          <h2>新增读数 / 巡检</h2>
        </div>
        {closed && <span className="badge bad">本班已交班，只读</span>}
      </div>

      <div className="field-grid">
        <label>
          <span>设备</span>
          <select
            value={deviceId}
            disabled={closed}
            onChange={(e) => {
              const next = devices.find((d) => d.id === e.target.value);
              setDeviceId(e.target.value);
              if (next) {
                const firstAvailable = ALL_METRICS.find(
                  (m) =>
                    !THRESHOLD_METRICS.includes(m as (typeof THRESHOLD_METRICS)[number]) ||
                    next.ranges[m as "rpm"]
                );
                setMetric(firstAvailable ?? "inspection");
                setValue("");
                setText("");
                setManualAlarm(false);
              }
            }}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>参数</span>
          <select
            value={metric}
            disabled={closed}
            onChange={(e) => {
              setMetric(e.target.value as Metric);
              setValue("");
              setText("");
              setManualAlarm(false);
            }}
          >
            {availableMetrics.map((m) => (
              <option key={m} value={m}>
                {METRIC_META[m].label}
                {METRIC_META[m].unit ? `（${METRIC_META[m].unit}）` : ""}
              </option>
            ))}
          </select>
        </label>

        {numeric ? (
          <label className="wide">
            <span>
              读数{METRIC_META[metric].unit ? `（${METRIC_META[metric].unit}）` : ""}
            </span>
            <input
              inputMode="decimal"
              value={value}
              disabled={closed}
              placeholder="输入数值"
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        ) : (
          <label className="wide">
            <span>状态描述 / 巡检内容</span>
            <input
              value={text}
              disabled={closed}
              placeholder="例如：舱底水液位接近警戒线"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}

        <label>
          <span>录入人</span>
          <input
            value={operator}
            disabled={closed}
            placeholder="姓名"
            onChange={(e) => setOperator(e.target.value)}
          />
        </label>

        {!numeric && (
          <label>
            <span>标记为异常巡检项</span>
            <div className="inline-controls">
              <input
                type="checkbox"
                checked={manualAlarm}
                disabled={closed}
                onChange={(e) => setManualAlarm(e.target.checked)}
              />
              <select
                value={severity}
                disabled={closed || !manualAlarm}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}
      </div>

      {rangeText && <p className="range-hint">{rangeText}</p>}
      {preview && (
        <p className={`judge-preview ${preview.status === "alarm" ? "alarm" : "ok"}`}>
          按当前范围判定：
          {preview.status === "normal"
            ? "正常，保存后写入正常判定快照"
            : `越限（${preview.severity === "critical" ? "危急" : "严重"}），保存后自动开出异常单`}
        </p>
      )}

      <div className="form-actions">
        <button className="primary" disabled={closed} onClick={submit}>
          保存到 {shift.slot}
        </button>
      </div>
    </section>
  );
}
