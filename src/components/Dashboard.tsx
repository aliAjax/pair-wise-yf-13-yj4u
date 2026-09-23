import { useMemo } from "react";
import type { Device, ParamKey, Reading } from "../types";
import { PARAM_META, bilgeText, currentRangesFor } from "../lib/domain";
import { useStore } from "../store";
import { Badge } from "./common";

/** 机舱参数看板：显示进行中班次每台设备最近一次读数与当前范围对照 */
export function Dashboard() {
  const { state } = useStore();
  const current = state.shifts.find((s) => s.id === state.currentShiftId) ?? null;

  const latestByDevice = useMemo(() => {
    const map = new Map<string, Reading>();
    for (const r of state.readings) {
      if (r.shiftId !== state.currentShiftId) continue;
      const cur = map.get(r.deviceId);
      if (!cur || r.at > cur.at) map.set(r.deviceId, r);
    }
    return map;
  }, [state.readings, state.currentShiftId]);

  const openStats = useMemo(() => {
    const open = state.anomalies.filter((a) => a.status === "open");
    return {
      total: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      warning: open.filter((a) => a.severity === "warning").length,
    };
  }, [state.anomalies]);

  return (
    <section className="panel dashboard">
      <div className="heading">
        <div>
          <p>机舱参数看板</p>
          <h2>{current ? `${current.label} · 设备最新读数` : "暂无进行中班次"}</h2>
        </div>
        <div className="stat-chips">
          <Badge tone="crit">严重未处理 {openStats.critical}</Badge>
          <Badge tone="warn">警告未处理 {openStats.warning}</Badge>
        </div>
      </div>

      <div className="dash-grid">
        {state.devices.map((device: Device) => {
          const latest = latestByDevice.get(device.id);
          const ranges = currentRangesFor(state, device.id);
          return (
            <article key={device.id} className="dash-card">
              <header>
                <b>{device.name}</b>
                <span className="muted-text">{device.group}</span>
              </header>
              {!latest ? (
                <p className="hint">本班次暂无读数</p>
              ) : (
                <ul className="dash-values">
                  {device.params.map((p: ParamKey) => {
                    const ev = latest.evaluations.find((e) => e.param === p);
                    if (ev === undefined) {
                      return (
                        <li key={p} className="dash-none">
                          {PARAM_META[p].label} <em>未录入</em>
                        </li>
                      );
                    }
                    const nowRange = ranges[p];
                    const nowStatus: "normal" | "warning" | "critical" =
                      nowRange && (ev.value < nowRange.min || ev.value > nowRange.max)
                        ? "warning"
                        : "normal";
                    const rangeChanged =
                      nowRange && (nowRange.min !== ev.range.min || nowRange.max !== ev.range.max);
                    return (
                      <li key={p} className={`dash-${ev.status}`}>
                        <span className="dash-label">{PARAM_META[p].label}</span>
                        <strong>
                          {ev.value}
                          <small>{ev.unit}</small>
                        </strong>
                        <em>
                          当时范围 {ev.range.min}~{ev.range.max}
                          {rangeChanged && ` · 现范围 ${nowRange!.min}~${nowRange!.max}`}
                        </em>
                        <Badge tone={ev.status === "normal" ? "ok" : ev.status === "warning" ? "warn" : "crit"}>
                          录入判定：{ev.status === "normal" ? "正常" : ev.status === "warning" ? "警告" : "严重"}
                        </Badge>
                        {rangeChanged && (
                          <Badge tone={nowStatus === "normal" ? "ok" : "warn"}>
                            按现范围{nowStatus === "normal" ? "正常" : "越限"}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                  {latest.values.fuelConsumption !== undefined && (
                    <li className="dash-normal">
                      <span className="dash-label">燃油消耗</span>
                      <strong>
                        {latest.values.fuelConsumption}
                        <small>L/h</small>
                      </strong>
                      <em>仅记录</em>
                      <Badge tone="muted">不判定</Badge>
                    </li>
                  )}
                  {device.bilge && latest.values.bilge && (
                    <li
                      className={`dash-${
                        latest.values.bilge === "high"
                          ? "critical"
                          : latest.values.bilge === "near"
                            ? "warning"
                            : "normal"
                      }`}
                    >
                      <span className="dash-label">舱底水</span>
                      <strong>{bilgeText(latest.values.bilge)}</strong>
                      <em>正常 / 预警 / 报警</em>
                      <Badge
                        tone={
                          latest.values.bilge === "high"
                            ? "crit"
                            : latest.values.bilge === "near"
                              ? "warn"
                              : "ok"
                        }
                      >
                        {latest.values.bilge === "high" ? "报警" : latest.values.bilge === "near" ? "预警" : "正常"}
                      </Badge>
                    </li>
                  )}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      <p className="hint">看板按当前安全范围对照显示；历史读数的实际判定请看时间线与历史记录中的快照。</p>
    </section>
  );
}
