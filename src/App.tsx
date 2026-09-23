import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./store";
import { RoleBar, ShiftPanel } from "./components/ShiftPanel";
import { Dashboard } from "./components/Dashboard";
import { EntryPanel } from "./components/EntryPanel";
import { ThresholdPanel } from "./components/ThresholdPanel";
import { Timeline } from "./components/Timeline";
import { HandoverPanel } from "./components/HandoverPanel";
import { HistoryPanel } from "./components/HistoryPanel";

const NAV = [
  { id: "dashboard", label: "参数看板" },
  { id: "entry", label: "读数录入" },
  { id: "timeline", label: "异常时间线" },
  { id: "thresholds", label: "安全范围" },
  { id: "handover", label: "交班摘要" },
  { id: "history", label: "历史记录" },
];

function Workspace() {
  const { state, dispatch } = useStore();
  // 设备/班次筛选在录入、时间线、历史、摘要之间共享
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [viewingShiftId, setViewingShiftId] = useState<string | null>(null);

  const pickDevice = (id: string | null) => {
    setDeviceId(id && id.length > 0 ? id : null);
  };

  return (
    <main className="app">
      <section className="hero compact">
        <div className="hero-top">
          <div>
            <p>hxyfront-62001 · Port 62001</p>
            <h1>船舶轮机值班记录</h1>
          </div>
          <div className="hero-actions">
            <button className="ghost" onClick={() => dispatch({ type: "resetDemo" })}>
              重置为演示数据
            </button>
            <button
              className="danger-ghost"
              onClick={() => {
                if (window.confirm("确定清空浏览器本地的全部值班数据？此操作不可恢复。")) {
                  dispatch({ type: "clearAll" });
                }
              }}
            >
              清空本地数据
            </button>
          </div>
        </div>
        <RoleBar />
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
      </section>

      <ShiftPanel />

      <div className="stack">
        <Dashboard />
        <EntryPanel
          deviceId={deviceId}
          onPickDevice={(id) => pickDevice(id)}
        />
        <Timeline
          deviceId={deviceId}
          onPickDevice={(id) => pickDevice(id)}
          viewingShiftId={viewingShiftId}
        />
        <ThresholdPanel />
        <HandoverPanel viewingShiftId={viewingShiftId} onViewShift={setViewingShiftId} />
        <HistoryPanel
          deviceId={deviceId}
          onPickDevice={pickDevice}
          viewingShiftId={viewingShiftId}
          onViewShift={setViewingShiftId}
        />
      </div>

      <footer className="foot">
        所有班次、读数判定、异常处理与交班摘要均保存在本浏览器 localStorage；阈值调整不回改历史判定与已冻结摘要。
        {state.role === "chief" ? " 当前：轮机长（可调安全范围）" : " 当前：轮机员（安全范围只读）"}
      </footer>
    </main>
  );
}

function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}

export default App;
