import { useMemo } from "react";
import type { Device, Shift } from "../types";
import { PARAM_META, bilgeText, fmtTime } from "../lib/domain";
import { useStore } from "../store";
import { Badge } from "./common";

export function HistoryPanel({
  deviceId,
  onPickDevice,
  viewingShiftId,
  onViewShift,
}: {
  deviceId: string | null;
  onPickDevice: (id: string | null) => void;
  viewingShiftId: string | null;
  onViewShift: (id: string | null) => void;
}) {
  const { state } = useStore();

  const deviceById = useMemo(
    () => new Map(state.devices.map((d) => [d.id, d])),
    [state.devices]
  );
  const shiftById = useMemo(
    () => new Map(state.shifts.map((s) => [s.id, s])),
    [state.shifts]
  );

  const readings = useMemo(
    () =>
      state.readings
        .filter((r) => !deviceId || r.deviceId === deviceId)
        .filter((r) => !viewingShiftId || r.shiftId === viewingShiftId)
        .sort((a, b) => b.at - a.at),
    [state.readings, deviceId, viewingShiftId]
  );

  const usedShifts = useMemo(() => {
    const ids = new Set(readings.map((r) => r.shiftId));
    return state.shifts.filter((s) => ids.has(s.id)).sort((a, b) => b.startedAt - a.startedAt);
  }, [readings, state.shifts]);

  return (
    <section className="panel" id="history">
      <div className="heading">
        <div>
          <p>历史记录</p>
          <h2>按设备与班次查询（判定均为录入当时的快照）</h2>
        </div>
      </div>

      <div className="history-filters">
        <div className="chips filter-chips">
          <button className={deviceId === null ? "chip active" : "chip"} onClick={() => onPickDevice(null)}>
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
        <div className="chips filter-chips">
          <button className={viewingShiftId === null ? "chip active" : "chip"} onClick={() => onViewShift(null)}>
            全部班次
          </button>
          {state.shifts
            .slice()
            .sort((a, b) => b.startedAt - a.startedAt)
            .map((s: Shift) => (
              <button
                key={s.id}
                className={viewingShiftId === s.id ? "chip active" : "chip"}
                onClick={() => onViewShift(s.id)}
              >
                {fmtDay(s.startedAt)} {s.label}
                {s.status === "ongoing" ? "（进行中）" : ""}
              </button>
            ))}
        </div>
      </div>

      {usedShifts.length > 0 && viewingShiftId === null && (
        <p className="hint">共涉及 {usedShifts.length} 个班次、{readings.length} 条读数。</p>
      )}

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>班次</th>
              <th>设备</th>
              <th>读数与当时判定</th>
              <th>记录人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => {
              const worst = r.evaluations.some((e) => e.status === "critical")
                ? "critical"
                : r.evaluations.some((e) => e.status === "warning")
                  ? "warning"
                  : "normal";
              const shift = shiftById.get(r.shiftId);
              return (
                <tr key={r.id}>
                  <td className="nowrap">{fmtTime(r.at)}</td>
                  <td className="nowrap">
                    {shift?.label ?? "—"}
                    {shift?.status === "closed" && <Badge tone="muted">已冻结</Badge>}
                  </td>
                  <td className="nowrap">{deviceById.get(r.deviceId)?.name ?? r.deviceId}</td>
                  <td>
                    <div className="tl-values">
                      {r.evaluations.map((ev) => (
                        <span key={ev.param} className={`value-chip value-${ev.status}`}>
                          {PARAM_META[ev.param].label} {ev.value}
                          {ev.unit}
                          <em>
                            {ev.status === "normal" ? "在范围内" : ev.status === "warning" ? "警告越限" : "严重越限"}{" "}
                            ({ev.range.min}~{ev.range.max}
                            {ev.unit})
                          </em>
                        </span>
                      ))}
                      {r.values.fuelConsumption !== undefined && (
                        <span className="value-chip value-neutral">
                          燃油 {r.values.fuelConsumption}L/h
                        </span>
                      )}
                      {r.values.bilge && (
                        <span
                          className={`value-chip value-${
                            r.values.bilge === "high"
                              ? "critical"
                              : r.values.bilge === "near"
                                ? "warning"
                                : "normal"
                          }`}
                        >
                          舱底水{bilgeText(r.values.bilge)}
                        </span>
                      )}
                      {r.evaluations.length === 0 &&
                        r.values.fuelConsumption === undefined &&
                        !r.values.bilge && <span className="muted-text">仅备注记录</span>}
                      {worst !== "normal" && (
                        <Badge tone={worst === "critical" ? "crit" : "warn"}>
                          阈值后改也不回改此判定
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="nowrap">{r.by}</td>
                  <td>{r.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {readings.length === 0 && <p className="hint">没有符合条件的读数。</p>}
      </div>
    </section>
  );
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
