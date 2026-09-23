import { useMemo } from "react";
import type { FrozenAnomaly } from "../types";
import { PARAM_META, fmtTime, freezeAnomaly, sourceLabel, worstOpenByDevice } from "../lib/domain";
import { useStore } from "../store";
import { Badge } from "./common";

/**
 * 交接班摘要：
 * - 进行中班次显示实时预览（按设备列出最严重的一条未完成异常）；
 * - 已关闭班次显示交班时冻结的快照，之后任何变化都不影响它。
 */
export function HandoverPanel({
  viewingShiftId,
  onViewShift,
}: {
  viewingShiftId: string | null;
  onViewShift: (id: string | null) => void;
}) {
  const { state } = useStore();
  const current = state.shifts.find((s) => s.id === state.currentShiftId) ?? null;
  const closed = state.shifts.filter((s) => s.status === "closed").sort((a, b) => b.endedAt! - a.endedAt!);
  const deviceById = useMemo(
    () => new Map(state.devices.map((d) => [d.id, d])),
    [state.devices]
  );

  const liveWorst = useMemo(() => worstOpenByDevice(state.anomalies), [state.anomalies]);
  const liveEntries = useMemo(() => {
    return [...liveWorst.entries()].map(([deviceId, anomaly]) => ({
      deviceId,
      deviceName: deviceById.get(deviceId)?.name ?? deviceId,
      anomaly: freezeAnomaly(
        anomaly,
        state.shifts.find((s) => s.id === anomaly.openedShiftId)?.label ?? "历史班次"
      ),
    }))
      .sort((a, b) => {
        const rank = { critical: 2, warning: 1 } as const;
        if (rank[b.anomaly.severity] !== rank[a.anomaly.severity]) {
          return rank[b.anomaly.severity] - rank[a.anomaly.severity];
        }
        return a.deviceName.localeCompare(b.deviceName, "zh");
      });
  }, [liveWorst, deviceById, state.shifts]);

  const shownClosed = viewingShiftId
    ? closed.filter((s) => s.id === viewingShiftId)
    : closed;

  return (
    <section className="panel" id="handover">
      <div className="heading">
        <div>
          <p>交接班摘要</p>
          <h2>每台设备仅列出最严重的一条未完成异常</h2>
        </div>
      </div>

      {current && viewingShiftId === null && (
        <div className="handover-live">
          <div className="handover-head">
            <h3>
              {current.label} 实时预览
              <Badge tone="info">未冻结 · 交班时生成快照</Badge>
            </h3>
            <span className="hint">开班 {fmtTime(current.startedAt)}</span>
          </div>
          {liveEntries.length === 0 ? (
            <p className="hint">当前无未完成异常，交班时摘要将为空（仍会冻结交接备注）。</p>
          ) : (
            <div className="handover-entries">
              {liveEntries.map((e) => (
                <FrozenRow key={e.deviceId} deviceName={e.deviceName} a={e.anomaly} live />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="handover-history">
        <h3>{viewingShiftId ? "该班次冻结的交班摘要" : "历史交班摘要（已冻结）"}</h3>
        {shownClosed.length === 0 && <p className="hint">暂无已关闭班次。</p>}
        {shownClosed.map((s) => (
          <article key={s.id} className="handover-card">
            <div className="handover-head">
              <h3>
                {s.label}
                <Badge tone="ok">已冻结</Badge>
              </h3>
              <span className="hint">
                交班 {s.endedAt ? fmtTime(s.endedAt) : "—"} · 交班人 {s.endedBy ?? "—"}
              </span>
            </div>
            <p className="handover-note">交接备注：{s.handover?.note || "（无）"}</p>
            <p className="handover-counts">
              交班时未完成异常 {s.handover?.openCount ?? 0} 条，其中严重{" "}
              {s.handover?.criticalCount ?? 0} 条。
            </p>
            {(s.handover?.entries.length ?? 0) === 0 ? (
              <p className="hint">交班时无未完成异常。</p>
            ) : (
              <div className="handover-entries">
                {s.handover!.entries.map((entry) => (
                  <FrozenRow
                    key={entry.deviceId}
                    deviceName={entry.deviceName}
                    a={entry.anomaly}
                  />
                ))}
              </div>
            )}
          </article>
        ))}
        {viewingShiftId && (
          <button className="ghost" onClick={() => onViewShift(null)}>
            返回全部交班摘要
          </button>
        )}
      </div>
    </section>
  );
}

function FrozenRow({
  deviceName,
  a,
  live,
}: {
  deviceName: string;
  a: FrozenAnomaly;
  live?: boolean;
}) {
  return (
    <div className={`frozen-row frozen-${a.severity}`}>
      <div className="frozen-head">
        <Badge tone={a.severity === "critical" ? "crit" : "warn"}>
          {a.severity === "critical" ? "最严重：严重" : "最严重：警告"}
        </Badge>
        <b>{deviceName}</b>
        <Badge tone="muted">{sourceLabel(a.source)}</Badge>
      </div>
      <p className="frozen-desc">{a.description}</p>
      <p className="frozen-meta">
        {a.rangeSnapshot && a.param && (
          <>
            当时范围 {a.rangeSnapshot.min}~{a.rangeSnapshot.max}
            {PARAM_META[a.param].unit}
            <span className="dot">·</span>
          </>
        )}
        发生于 {a.openedShiftLabel}（{fmtTime(a.openedAt)}）
        <span className="dot">·</span>
        已累计触发 {a.refCount} 次
      </p>
      {live && <p className="hint">实时数据，交班确认后才会冻结。</p>}
    </div>
  );
}
