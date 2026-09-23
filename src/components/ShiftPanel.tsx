import { useMemo, useState } from "react";
import type { Role } from "../types";
import { fmtTime } from "../lib/domain";
import { useStore } from "../store";
import { Badge } from "./common";

const WATCH_LABELS = ["00-04班", "04-08班", "08-12班", "12-16班", "16-20班", "20-24班"];

export function ShiftPanel() {
  const { state, dispatch } = useStore();
  const current = state.shifts.find((s) => s.id === state.currentShiftId) ?? null;

  const [label, setLabel] = useState(WATCH_LABELS[2]);
  const [customLabel, setCustomLabel] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [note, setNote] = useState("");

  const openCount = useMemo(
    () => state.anomalies.filter((a) => a.status === "open").length,
    [state.anomalies]
  );
  const criticalCount = useMemo(
    () => state.anomalies.filter((a) => a.status === "open" && a.severity === "critical").length,
    [state.anomalies]
  );

  const start = () => {
    const finalLabel = customLabel.trim() || label;
    dispatch({
      type: "startShift",
      label: finalLabel,
      at: Date.now(),
    });
    setCustomLabel("");
  };

  const close = () => {
    dispatch({
      type: "closeShift",
      note,
      at: Date.now(),
    });
    setNote("");
    setConfirmClose(false);
  };

  return (
    <section className="panel shift-panel">
      <div className="heading">
        <div>
          <p>值班班次</p>
          <h2>{current ? `进行中：${current.label}` : "当前无进行中班次"}</h2>
        </div>
        {current ? (
          <Badge tone="crit">
            {openCount} 条未完成异常{criticalCount > 0 ? `（${criticalCount} 条严重）` : ""}
          </Badge>
        ) : (
          <Badge tone="muted">请先开班</Badge>
        )}
      </div>

      {current ? (
        <div className="shift-info">
          <p>
            开班时间：{fmtTime(current.startedAt)} · 开班人：{current.startedBy}
          </p>
          <p className="hint">
            本班次录入的读数与巡检项均按“当前”安全范围判定，判定结果随班次保存；之后再调整范围不会回改。
          </p>
          <div className="shift-btns">
            <button className="danger-ghost" onClick={() => setConfirmClose(true)}>
              交班并关闭本班次
            </button>
          </div>
        </div>
      ) : (
        <div className="start-shift">
          <label className="start-label">
            <span>选择班次时段</span>
            <select value={label} onChange={(e) => setLabel(e.target.value)}>
              {WATCH_LABELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="start-label">
            <span>或自定义班次名</span>
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="如：台风值守班"
            />
          </label>
          <button className="primary start-btn" onClick={start}>
            开班
          </button>
        </div>
      )}

      {confirmClose && (
        <div className="modal-mask" onClick={() => setConfirmClose(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>交班确认</h3>
            <p className="hint">
              交班摘要将在此时冻结：按每台设备列出最严重的一条未完成异常。交班后即使异常处理或阈值变化，摘要也不再改变。
            </p>
            <p>
              当前未完成异常 <b>{openCount}</b> 条，其中严重 <b>{criticalCount}</b> 条。
            </p>
            <label className="full-label">
              <span>交接备注</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="本班运行情况、需下班继续跟踪的事项"
              />
            </label>
            <div className="modal-btns">
              <button className="primary" onClick={close}>
                确认交班
              </button>
              <button className="ghost" onClick={() => setConfirmClose(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function RoleBar() {
  const { state, dispatch } = useStore();
  const [name, setNameState] = useState(state.userName);

  const setRole = (role: Role) => {
    dispatch({ type: "setRole", role });
  };

  return (
    <div className="role-bar">
      <div className="role-switch">
        <button
          className={state.role === "engineer" ? "tab active" : "tab"}
          onClick={() => setRole("engineer")}
        >
          轮机员
        </button>
        <button
          className={state.role === "chief" ? "tab active" : "tab"}
          onClick={() => setRole("chief")}
        >
          轮机长
        </button>
      </div>
      <label className="name-field">
        <span>当前值班人</span>
        <input
          value={name}
          onChange={(e) => setNameState(e.target.value)}
          onBlur={() => dispatch({ type: "setName", name })}
        />
      </label>
      <span className="local-hint">数据仅保存在本浏览器（localStorage）</span>
    </div>
  );
}
