import type { Shift } from "../types";
import { fmtTime } from "../domain";

interface Props {
  shifts: Shift[];
  activeShiftId: string;
  onSwitch: (id: string) => void;
}

export function ShiftBar({ shifts, activeShiftId, onSwitch }: Props) {
  const ordered = [...shifts].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return (
    <section className="panel shift-bar">
      <div className="shift-info">
        <p>值班班次</p>
        <h2>{ordered.find((s) => s.id === activeShiftId)?.label ?? "—"}</h2>
      </div>
      <div className="shift-tabs">
        {ordered.map((s) => (
          <button
            key={s.id}
            className={`shift-tab ${s.id === activeShiftId ? "active" : ""}`}
            onClick={() => onSwitch(s.id)}
          >
            <b>{s.slot}</b>
            <small>{s.date.slice(5)}</small>
            <span className={`badge ${s.status === "open" ? "good" : ""}`}>
              {s.status === "open" ? "进行中" : `已交班 ${fmtTime(s.handover!.ts)}`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
