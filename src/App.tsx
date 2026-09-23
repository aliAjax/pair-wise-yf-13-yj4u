import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { useWatchStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { ReadingForm } from "./components/ReadingForm";
import { Timeline } from "./components/Timeline";
import { HandoverPanel } from "./components/Handover";
import { ThresholdSettings } from "./components/ThresholdSettings";
import { ShiftBar } from "./components/ShiftBar";

type Role = "chief" | "engineer";

const ROLE_KEY = "engine-watch-role";
const OPERATOR_KEY = "engine-watch-operator";

export default function App() {
  const store = useWatchStore();
  const { data, activeShift } = store;

  const [role, setRole] = useState<Role>(
    () => (localStorage.getItem(ROLE_KEY) as Role) || "engineer"
  );
  const [operator, setOperator] = useState(
    () => localStorage.getItem(OPERATOR_KEY) || "李轮机"
  );
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);
  useEffect(() => {
    localStorage.setItem(OPERATOR_KEY, operator);
  }, [operator]);

  const viewingClosed = !activeShift || activeShift.status === "closed";

  const openCount = useMemo(
    () => data.anomalies.filter((a) => a.status === "open").length,
    [data.anomalies]
  );

  const locate = (anomalyId: string) => {
    const a = data.anomalies.find((x) => x.id === anomalyId);
    if (a) setDeviceFilter(a.deviceId);
    setHighlight(anomalyId);
    setTimeout(() => {
      document.getElementById("timeline-panel")?.scrollIntoView({ behavior: "smooth" });
    }, 30);
    setTimeout(() => setHighlight(null), 4000);
  };

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="kicker">船舶轮机 · 机舱值班记录台</p>
          <h1>轮机值班记录系统</h1>
          <span className="sub">
            数据仅保存在本浏览器（localStorage），按设备独立安全范围，判定快照不可追溯修改
          </span>
        </div>
        <div className="topbar-actions">
          <label className="operator-box">
            <span>当前轮机员</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} />
          </label>
          <div className="role-switch" role="group" aria-label="角色切换">
            <button
              className={role === "engineer" ? "active" : ""}
              onClick={() => setRole("engineer")}
            >
              轮机员
            </button>
            <button
              className={role === "chief" ? "active" : ""}
              onClick={() => setRole("chief")}
            >
              轮机长
            </button>
          </div>
          <button
            className="link-btn danger"
            onClick={() => {
              if (confirm("确认清空全部本地数据并恢复演示数据？此操作不可撤销。")) store.reset();
            }}
          >
            重置本地数据
          </button>
        </div>
      </header>

      <div className="stat-strip">
        <span>进行班次：{data.shifts.filter((s) => s.status === "open").length}</span>
        <span className={openCount ? "stat-alarm" : ""}>未处理异常：{openCount}</span>
        <span>累计读数：{data.readings.length}</span>
        <span>设备数：{data.devices.length}</span>
      </div>

      <ShiftBar
        shifts={data.shifts}
        activeShiftId={data.activeShiftId}
        onSwitch={store.switchShift}
      />

      {activeShift && (
        <HandoverPanel
          data={data}
          shift={activeShift}
          canHandover={!viewingClosed}
          onHandover={store.handover}
          onLocate={locate}
        />
      )}

      <Dashboard data={data} deviceFilter={deviceFilter} onLocate={locate} />

      <section className="workspace">
        <aside className="panel">
          <h2>按设备筛选</h2>
          <div className="chips vertical">
            <button
              className={deviceFilter === "all" ? "active" : ""}
              onClick={() => setDeviceFilter("all")}
            >
              全部设备
            </button>
            {data.devices.map((d) => (
              <button
                key={d.id}
                className={deviceFilter === d.id ? "active" : ""}
                onClick={() => setDeviceFilter(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
          <p className="hint">筛选同时作用于看板、时间线与历史记录。</p>
        </aside>

        <ReadingForm
          devices={data.devices}
          shift={activeShift}
          defaultOperator={operator}
          onSubmit={store.addReading}
        />
      </section>

      <Timeline
        data={data}
        deviceFilter={deviceFilter}
        highlightId={highlight}
        onResolve={store.resolveAnomaly}
        readonly={viewingClosed}
        activeShiftId={data.activeShiftId}
      />

      <ThresholdSettings
        devices={data.devices}
        isChief={role === "chief"}
        onUpdate={(deviceId, metric, min, max) => store.updateRange(deviceId, metric, { min, max })}
      />

      <footer className="footer">
        本系统所有班次、读数、异常单与交接摘要均存储于浏览器本地，不上传服务器。
      </footer>
    </main>
  );
}
