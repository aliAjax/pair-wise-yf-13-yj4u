import { useMemo, useState } from "react";
import type { AppData, Shift } from "../types";
import { buildHandoverItems, fmtTime, METRIC_META, SEVERITY_META } from "../domain";

interface PanelProps {
  data: AppData;
  shift: Shift;
  canHandover: boolean;
  onHandover: (operator: string, note: string, nextSlot: string, date: string) => void;
  onLocate: (anomalyId: string) => void;
}

/** 交班摘要面板：当前班次未交班时显示实时预览；已交班则显示冻结快照 */
export function HandoverPanel({
  data,
  shift,
  canHandover,
  onHandover,
  onLocate,
}: PanelProps) {
  const frozen = shift.handover;
  const liveItems = useMemo(
    () => (frozen ? [] : buildHandoverItems(data.anomalies, data.devices)),
    [frozen, data.anomalies, data.devices]
  );

  const items = frozen ? frozen.items : liveItems;

  return (
    <section className="panel handover">
      <div className="heading">
        <div>
          <p>交接班摘要</p>
          <h2>{frozen ? `已冻结 · ${shift.label}` : `交班预览 · ${shift.label}`}</h2>
        </div>
        {frozen ? (
          <span className="badge good">
            {fmtTime(frozen.ts)} 由 {frozen.fromOperator} 交班
          </span>
        ) : (
          <HandoverButton
            shift={shift}
            disabled={!canHandover}
            items={liveItems}
            onHandover={onHandover}
          />
        )}
      </div>

      {frozen && frozen.note && (
        <p className="handover-note">
          <b>交接备注：</b>
          {frozen.note}
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty-state">
          {frozen ? "交班时无未完成异常" : "当前无未完成异常，交班摘要将为空"}
        </p>
      ) : (
        <div className="handover-grid">
          {items.map((item) => {
            const sev = SEVERITY_META[item.severity];
            return (
              <article
                key={item.deviceId + item.anomalyId}
                className="handover-card"
                style={{ borderTopColor: sev.border }}
              >
                <header>
                  <b>{item.deviceName}</b>
                  <span
                    className="badge"
                    style={{ color: sev.color, background: sev.bg, borderColor: sev.border }}
                  >
                    {sev.label}
                  </span>
                </header>
                <p>{item.title}</p>
                <small>
                  {METRIC_META[item.metric].label} · 开出于 {fmtTime(item.openedAt)}
                </small>
                {!frozen && (
                  <button className="link-btn" onClick={() => onLocate(item.anomalyId)}>
                    前往处理
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {frozen && (
        <p className="hint">
          此摘要为交班时刻的冻结快照：此后阈值调整、异常处理或读数恢复都不会改变本班判定与摘要。
        </p>
      )}
    </section>
  );
}

function HandoverButton({
  shift,
  disabled,
  items,
  onHandover,
}: {
  shift: Shift;
  disabled: boolean;
  items: ReturnType<typeof buildHandoverItems>;
  onHandover: (operator: string, note: string, nextSlot: string, date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [nextSlot, setNextSlot] = useState("12-16班");

  return (
    <>
      <button className="primary" disabled={disabled} onClick={() => setOpen(true)}>
        交班并开新班
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} title={`交班：${shift.label}`}>
          <p className="hint">
            交班瞬间将按设备冻结最严重的一条未完成异常（当前 {items.length} 台设备有待处理项），
            保存后不可修改。
          </p>
          <div className="field-grid">
            <label>
              <span>交班人 *</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="姓名" />
            </label>
            <label>
              <span>下一班次</span>
              <select value={nextSlot} onChange={(e) => setNextSlot(e.target.value)}>
                {["00-04班", "04-08班", "08-12班", "12-16班", "16-20班", "20-24班"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              <span>交接备注</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="其他需要下一班注意的事项" />
            </label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setOpen(false)}>取消</button>
            <button
              className="primary"
              disabled={!operator.trim()}
              onClick={() => {
                const date = new Date().toISOString().slice(0, 10);
                onHandover(operator.trim(), note.trim(), nextSlot, date);
                setOpen(false);
                setOperator("");
                setNote("");
              }}
            >
              确认交班（冻结摘要）
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <h2>{title}</h2>
          <button className="link-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
