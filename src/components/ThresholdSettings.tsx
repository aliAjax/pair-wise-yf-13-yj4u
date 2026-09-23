import { useState } from "react";
import type { Device, NumericMetric } from "../types";
import { METRIC_META, THRESHOLD_METRICS } from "../domain";

interface Props {
  devices: Device[];
  isChief: boolean;
  onUpdate: (deviceId: string, metric: NumericMetric, min: number, max: number) => void;
}

export function ThresholdSettings({ devices, isChief, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [error, setError] = useState("");

  const startEdit = (device: Device, metric: NumericMetric) => {
    const r = device.ranges[metric];
    setEditing(`${device.id}:${metric}`);
    setDraft({ min: String(r?.min ?? ""), max: String(r?.max ?? "") });
    setError("");
  };

  const save = (device: Device, metric: NumericMetric) => {
    const min = Number(draft.min);
    const max = Number(draft.max);
    if (draft.min.trim() === "" || draft.max.trim() === "" || Number.isNaN(min) || Number.isNaN(max)) {
      setError("上下限必须为数字");
      return;
    }
    if (min >= max) {
      setError("下限必须小于上限");
      return;
    }
    onUpdate(device.id, metric, min, max);
    setEditing(null);
  };

  return (
    <section className="panel thresholds">
      <div className="heading">
        <div>
          <p>安全范围设置（按设备）</p>
          <h2>主机转速 / 滑油压力 / 冷却水温阈值</h2>
        </div>
        {!isChief && <span className="badge bad">仅轮机长可调整</span>}
      </div>
      <p className="hint">
        调整只影响此后新录入读数的判定；已保存班次的读数判定、异常单和交接摘要均保持原样。
      </p>

      <div className="threshold-list">
        {devices.map((device) => (
          <article key={device.id} className="threshold-device">
            <h3>
              {device.name} <small>{device.kind}</small>
            </h3>
            <div className="threshold-rows">
              {THRESHOLD_METRICS.map((metric) => {
                const range = device.ranges[metric];
                const key = `${device.id}:${metric}`;
                const isEditing = editing === key;
                return (
                  <div key={metric} className="threshold-row">
                    <span className="metric-label">{METRIC_META[metric].label}</span>
                    {!range && <span className="hint">该设备不监测此项</span>}
                    {range && !isEditing && (
                      <>
                        <span className="range-text">
                          {range.min} ~ {range.max} {METRIC_META[metric].unit}
                        </span>
                        <button
                          className="link-btn"
                          disabled={!isChief}
                          onClick={() => startEdit(device, metric)}
                        >
                          修改
                        </button>
                      </>
                    )}
                    {range && isEditing && (
                      <div className="range-edit">
                        <input
                          value={draft.min}
                          onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))}
                          placeholder="下限"
                        />
                        <span>~</span>
                        <input
                          value={draft.max}
                          onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
                          placeholder="上限"
                        />
                        <span>{METRIC_META[metric].unit}</span>
                        <button className="primary" onClick={() => save(device, metric)}>
                          保存
                        </button>
                        <button className="link-btn" onClick={() => setEditing(null)}>
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      {error && <p className="judge-preview alarm">{error}</p>}
    </section>
  );
}
