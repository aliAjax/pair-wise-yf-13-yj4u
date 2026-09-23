import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Anomaly,
  AnomalySource,
  BilgeLevel,
  DeviceRanges,
  ParamKey,
  PersistState,
  Range,
  Reading,
  ReadingValues,
} from "./types";
import {
  PARAM_META,
  bilgeSeverity,
  bilgeText,
  buildHandover,
  currentRangesFor,
  evaluate,
  fmtValue,
} from "./lib/domain";
import { makeSeedState } from "./lib/seed";

const STORAGE_KEY = "hxyfront-62001-watch-state-v1";

type Action =
  | { type: "setRole"; role: PersistState["role"] }
  | { type: "setName"; name: string }
  | { type: "startShift"; label: string; at: number }
  | { type: "closeShift"; note: string; at: number }
  | {
      type: "addReading";
      deviceId: string;
      values: ReadingValues;
      note: string;
      at: number;
    }
  | {
      type: "addInspection";
      deviceId: string;
      severity: "warning" | "critical";
      description: string;
      at: number;
    }
  | { type: "resolveAnomaly"; anomalyId: string; handler: string; result: string; at: number }
  | { type: "updateRanges"; deviceId: string; ranges: DeviceRanges; note: string; at: number }
  | { type: "resetDemo" }
  | { type: "clearAll" };

function nextId(state: PersistState, prefix: string): string {
  return `${prefix}-${state.seq}`;
}

export function reducer(state: PersistState, action: Action): PersistState {
  switch (action.type) {
    case "setRole":
      return { ...state, role: action.role };

    case "setName":
      if (!action.name.trim()) return state;
      return { ...state, userName: action.name.trim() };

    case "startShift": {
      const id = nextId(state, "sh");
      return {
        ...state,
        seq: state.seq + 1,
        currentShiftId: id,
        shifts: [
          ...state.shifts,
          {
            id,
            label: action.label,
            startedAt: action.at,
            startedBy: state.userName,
            status: "ongoing",
          },
        ],
      };
    }

    case "closeShift": {
      const shiftId = state.currentShiftId;
      if (!shiftId) return state;
      const snapshot = buildHandover(state, action.at, state.userName, action.note);
      return {
        ...state,
        currentShiftId: null,
        shifts: state.shifts.map((s) =>
          s.id === shiftId
            ? { ...s, status: "closed", endedAt: action.at, endedBy: state.userName, handover: snapshot }
            : s
        ),
      };
    }

    case "addReading": {
      const shiftId = state.currentShiftId;
      if (!shiftId) return state;

      const ranges = currentRangesFor(state, action.deviceId);
      const evaluations = (["rpm", "oilPressure", "coolantTemp"] as ParamKey[])
        .filter((p) => action.values[p] !== undefined && ranges[p])
        .map((p) => evaluate(p, action.values[p] as number, ranges[p]!));

      const anomalyIds: string[] = [];
      const anomalyPatches: Anomaly[] = [];
      const newAnomalies: Anomaly[] = [];
      const readingId = nextId(state, "rd");
      let idCounter = 0;
      const newAnomalyId = () => nextId({ ...state, seq: state.seq + idCounter++ }, "an");

      const upsertAnomaly = (
        source: AnomalySource,
        param: ParamKey | undefined,
        severity: "warning" | "critical",
        description: string,
        detail: string,
        value?: number,
        unit?: string,
        rangeSnapshot?: Range
      ) => {
        const existing = state.anomalies.find(
          (a) =>
            a.status === "open" &&
            a.deviceId === action.deviceId &&
            a.source === source &&
            a.param === param
        );
        if (existing) {
          anomalyIds.push(existing.id);
          anomalyPatches.push({
            ...existing,
            refs: [...existing.refs, { readingId, at: action.at, detail }],
          });
        } else {
          const id = newAnomalyId();
          anomalyIds.push(id);
          newAnomalies.push({
            id,
            deviceId: action.deviceId,
            source,
            openedShiftId: shiftId,
            openedAt: action.at,
            param,
            value,
            unit,
            rangeSnapshot: rangeSnapshot ? { ...rangeSnapshot } : undefined,
            severity,
            description,
            refs: [{ readingId, at: action.at, detail }],
            status: "open",
          });
        }
      };

      // 参数越限（按当前范围判定并把范围快照存进异常）
      for (const ev of evaluations) {
        if (ev.status === "normal") continue;
        const dir = ev.value < ev.range.min ? "偏低" : "偏高";
        upsertAnomaly(
          "reading",
          ev.param,
          ev.status,
          `${PARAM_META[ev.param].label}越限：${ev.range.min}~${ev.range.max}${ev.unit} 之外`,
          `${PARAM_META[ev.param].label}${dir} ${fmtValue(ev.value, ev.param)}${ev.unit}，当前限值 ${
            ev.value < ev.range.min ? ev.range.min : ev.range.max
          }${ev.unit}，超出 ${fmtValue(ev.excess, ev.param)}${ev.unit}`,
          ev.value,
          ev.unit,
          ev.range
        );
      }

      // 舱底水：仅高位报警开异常；“接近警戒线”是预警不生成异常
      const bilge: BilgeLevel | undefined = action.values.bilge;
      if (bilge) {
        const sev = bilgeSeverity(bilge);
        if (sev) {
          upsertAnomaly("bilge", undefined, sev, `舱底水${bilgeText(bilge)}`, bilgeText(bilge));
        }
      }

      const reading: Reading = {
        id: readingId,
        shiftId,
        deviceId: action.deviceId,
        at: action.at,
        by: state.userName,
        values: { ...action.values },
        evaluations,
        anomalyIds,
        note: action.note.trim() || undefined,
      };

      const patchById = new Map(anomalyPatches.map((a) => [a.id, a]));
      return {
        ...state,
        seq: state.seq + 1 + newAnomalies.length,
        readings: [...state.readings, reading],
        anomalies: [...state.anomalies.map((a) => patchById.get(a.id) ?? a), ...newAnomalies],
      };
    }

    case "addInspection": {
      const shiftId = state.currentShiftId;
      if (!shiftId) return state;
      const id = nextId(state, "an");
      const anomaly: Anomaly = {
        id,
        deviceId: action.deviceId,
        source: "inspection",
        openedShiftId: shiftId,
        openedAt: action.at,
        severity: action.severity,
        description: action.description.trim(),
        refs: [],
        status: "open",
      };
      return {
        ...state,
        seq: state.seq + 1,
        anomalies: [...state.anomalies, anomaly],
      };
    }

    case "resolveAnomaly": {
      const shiftId = state.currentShiftId;
      return {
        ...state,
        anomalies: state.anomalies.map((a) =>
          a.id === action.anomalyId
            ? {
                ...a,
                status: "resolved",
                handler: action.handler.trim(),
                result: action.result.trim(),
                resolvedAt: action.at,
                resolvedShiftId: shiftId ?? undefined,
              }
            : a
        ),
      };
    }

    case "updateRanges": {
      const revId = nextId(state, "rv");
      return {
        ...state,
        seq: state.seq + 1,
        ranges: { ...state.ranges, [action.deviceId]: action.ranges },
        revisions: [
          ...state.revisions,
          {
            id: revId,
            deviceId: action.deviceId,
            ranges: action.ranges,
            by: state.userName,
            at: action.at,
            note: action.note.trim() || "调整安全范围",
          },
        ],
      };
    }

    case "resetDemo":
      return makeSeedState();

    case "clearAll": {
      const fresh = makeSeedState();
      return {
        ...fresh,
        devices: [],
        ranges: {},
        revisions: [],
        shifts: [],
        currentShiftId: null,
        readings: [],
        anomalies: [],
      };
    }

    default:
      return state;
  }
}

function loadInitial(): PersistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // 数据损坏时回退到演示数据
  }
  return makeSeedState();
}

interface Store {
  state: PersistState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅在当前会话保留
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
