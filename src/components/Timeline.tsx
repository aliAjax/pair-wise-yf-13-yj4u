import { useMemo, useState } from "react";
import type { Device } from "../types";
import {
  PARAM_META,
  bilgeText,
  buildTimeline,
  fmtTime,
  shiftLabelOf,
} from "../lib/domain";
import { useStore } from "../store";
import { AnomalyCard, Badge, StatusBadge } from "./common";

export function Timeline({
  deviceId,
  onPickDevice,
  viewingShiftId,
}: {
  deviceId: string | null;
  onPickDevice: (id: string) => void;
  viewingShiftId: string | null;
}) {
  const { state, dispatch } = useStore();
  const current = state.shifts.find((s) => s.id === state.currentShiftId) ?? null;
  const readOnly = viewingShiftId !== null;

  const [inspDevice, setInspDevice] = useState(state.devices[0]?.id ?? "");
  const [severity, setSeverity] = useState<"warning" | "critical">("warning");
  const [description, setDescription] = useState("");

  const deviceById = useMemo(
    () => new Map(state.devices.map((d) => [d.id, d])),
    [state.devices]
  );

  const openAnomalies = useMemo(
    () =>
      state.anomalies
        .filter((a) => a.status === "open")
        .filter((a) => !deviceId || a.deviceId === deviceId)
        .sort((a, b) => {
          const rank = { critical: 2, warning: 1 } as const;
          if (rank[b.severity] !== rank[a.severity]) return rank[b.severity] - rank[a.severity];
          return a.openedAt - b.openedAt;
        }),
    [state.anomalies, deviceId]
  );

  const items = useMemo(() => {
    const all = buildTimeline(state, deviceId);
    if (!viewingShiftId) return all;
    return all.filter((it) =>
      it.kind === "reading"
        ? it.reading!.shiftId === viewingShiftId
        : it.anomaly!.openedShiftId === viewingShiftId
    );
  }, [state, deviceId, viewingShiftId]);

  const addInspection = () => {
    if (!description.trim() || !current) return;
    dispatch({
      type: "addInspection",
      deviceId: inspDevice,
      severity,
      description,
      at: Date.now(),
    });
    setDescription("");
  };

  return (
    <section className="panel" id="timeline">
      <div className="heading">
        <div>
          <p>异常记录时间线</p>
          <h2>越界后异常持续保留，须填写处理人与处理结果</h2>
        </div>
        {readOnly ? (
          <Badge tone="muted">历史班次只读视图</Badge>
        ) : (
          <Badge tone="warn">{openAnomalies.length} 条未处理</Badge>
        )}
      </div>

      <div className="chips filter-chips">
        <button className={deviceId === null ? "chip active" : "chip"} onClick={() => onPickDevice("")}>
          全部设备
        </button>
        {state.devices.map((d: Device) => (
          <button
            key={d.id}
            className={deviceId === d.id ? "chip active" : "chip"}
            onClick={() => onPickDevice(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>

      {!readOnly && current && (
        <div className="inspection-box">
          <h3>巡检异常登记</h3>
          <div className="inspection-form">
            <label>
              <span>设备</span>
              <select value={inspDevice} onChange={(e) => setInspDevice(e.target.value)}>
                {state.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>严重程度</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "warning" | "critical")}
              >
                <option value="warning">警告</option>
                <option value="critical">严重</option>
              </select>
            </label>
            <label className="insp-desc">
              <span>异常描述 *</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="如：海水泵出口法兰渗漏"
              />
            </label>
            <button className="primary" disabled={!description.trim()} onClick={addInspection}>
              登记巡检异常
            </button>
          </div>
        </div>
      )}

      {!readOnly && openAnomalies.length > 0 && (
        <div className="open-block">
          <h3>未完成异常（读数恢复也不自动关闭，可跨班次处理）</h3>
          <div className="anomaly-list">
            {openAnomalies.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                deviceName={deviceById.get(a.deviceId)?.name ?? a.deviceId}
                shiftLabel={shiftLabelOf(state, a.openedShiftId)}
                canResolve={current !== null}
              />
            ))}
          </div>
        </div>
      )}

      {readOnly && (
        <div className="open-block">
          <h3>该班次涉及的异常（只读）</h3>
          <div className="anomaly-list">
            {state.anomalies
              .filter((a) => !deviceId || a.deviceId === deviceId)
              .filter((a) => a.openedShiftId === viewingShiftId)
              .sort((a, b) => {
                const rank = { critical: 2, warning: 1 } as const;
                if (rank[b.severity] !== rank[a.severity]) return rank[b.severity] - rank[a.severity];
                return a.openedAt - b.openedAt;
              })
              .map((a) => (
                <AnomalyCard
                  key={a.id}
                  anomaly={a}
                  deviceName={deviceById.get(a.deviceId)?.name ?? a.deviceId}
                  shiftLabel={shiftLabelOf(state, a.openedShiftId)}
                  canResolve={false}
                />
              ))}
          </div>
          <p className="hint">
            卡片显示异常的当前状态；该班次交班瞬间每台设备最严重的一条未完成异常，以“交班摘要”中的冻结快照为准。
          </p>
        </div>
      )}

      <h3>{readOnly ? "该班次时间线" : "全部时间线"}</h3>
      {items.length === 0 && <p className="hint">该条件下暂无记录。</p>}
      <ul className="timeline">
        {items.map((item) =>
          item.kind === "reading" ? (
            <ReadingRow
              key={item.reading!.id}
              reading={item.reading!}
              deviceName={deviceById.get(item.reading!.deviceId)?.name ?? item.reading!.deviceId}
              shiftLabel={shiftLabelOf(state, item.reading!.shiftId)}
            />
          ) : (
            <li key={item.anomaly!.id} className="tl-inspection">
              <AnomalyCard
                anomaly={item.anomaly!}
                deviceName={deviceById.get(item.anomaly!.deviceId)?.name ?? item.anomaly!.deviceId}
                shiftLabel={shiftLabelOf(state, item.anomaly!.openedShiftId)}
                canResolve={!readOnly && current !== null}
                compact
              />
            </li>
          )
        )}
      </ul>
      {readOnly && current && (
        <p className="hint">
          历史班次视图为只读。如需处理遗留异常，请切回“全部班次”视图，处理记录会登记在当前进行中的 {current.label}。
        </p>
      )}
    </section>
  );
}

function ReadingRow({
  reading,
  deviceName,
  shiftLabel,
}: {
  reading: import("../types").Reading;
  deviceName: string;
  shiftLabel: string;
}) {
  const worst = reading.evaluations.some((e) => e.status === "critical")
    ? "critical"
    : reading.evaluations.some((e) => e.status === "warning")
      ? "warning"
      : "normal";
  const bilge = reading.values.bilge;

  return (
    <li className={`tl-reading tl-${worst}`}>
      <div className="tl-time">
        <b>{fmtTime(reading.at)}</b>
        <span>{shiftLabel}</span>
      </div>
      <div className="tl-body">
        <div className="tl-title">
          <b>{deviceName}</b>
          <span className="tl-by">记录人 {reading.by}</span>
          <StatusBadge status={worst} />
        </div>
        <div className="tl-values">
          {reading.evaluations.map((ev) => (
            <span key={ev.param} className={`value-chip value-${ev.status}`}>
              {PARAM_META[ev.param].label} {ev.value}
              {ev.unit}
              <em>
                当时范围 {ev.range.min}~{ev.range.max}
                {ev.unit}
              </em>
            </span>
          ))}
          {reading.values.fuelConsumption !== undefined && (
            <span className="value-chip value-neutral">
              燃油消耗 {reading.values.fuelConsumption}L/h
            </span>
          )}
          {bilge && (
            <span className={`value-chip value-${bilge === "high" ? "critical" : bilge === "near" ? "warning" : "normal"}`}>
              舱底水{bilgeText(bilge)}
            </span>
          )}
        </div>
        {reading.note && <p className="tl-note">备注：{reading.note}</p>}
        {reading.anomalyIds.length > 0 && (
          <p className="tl-linked">
            <Badge tone="warn">关联 {reading.anomalyIds.length} 条异常</Badge>
          </p>
        )}
      </div>
    </li>
  );
}
