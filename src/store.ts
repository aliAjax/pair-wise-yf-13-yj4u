import { useCallback, useEffect, useState } from "react";
import type {
  Anomaly,
    AppData,
  Handover,
  Metric,
  NumericMetric,
  Range,
  Reading,
  Severity,
  Shift,
} from "./types";
import { loadData, resetData, saveData } from "./storage";
import {
  buildHandoverItems,
  evaluate,
  findOpenAnomaly,
  METRIC_META,
  nowTs,
  uid,
} from "./domain";

export interface NewReadingInput {
  deviceId: string;
  metric: Metric;
  value: number | null;
  text: string | null;
  operator: string;
  /** 文本类巡检项手动标记异常时使用 */
  manualAlarm: boolean;
  severity: Severity;
}

export function useWatchStore() {
  const [data, setData] = useState<AppData>(() => loadData());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const activeShift = data.shifts.find((s) => s.id === data.activeShiftId);

  const addReading = useCallback(
    (input: NewReadingInput) => {
      setData((prev) => {
        const shift = prev.shifts.find((s) => s.id === prev.activeShiftId);
        if (!shift || shift.status !== "open") return prev;
        const device = prev.devices.find((d) => d.id === input.deviceId);
        if (!device) return prev;

        const judgment =
          input.metric === "fuel" ||
          input.metric === "bilge" ||
          input.metric === "inspection"
            ? null
            : evaluate(input.metric, input.value, device);

        const isAlarm =
          judgment?.status === "alarm" ||
          (input.manualAlarm && input.text?.trim());
        const ts = nowTs();
        const readingId = uid("r");

        let anomalies = prev.anomalies;
        let anomalyId: string | undefined;

        if (isAlarm) {
          const existing = findOpenAnomaly(
            prev.anomalies,
            input.deviceId,
            input.metric
          );
          const meta = METRIC_META[input.metric];
          if (existing) {
            anomalyId = existing.id;
            anomalies = prev.anomalies.map((a) =>
              a.id === existing.id
                ? { ...a, readingIds: [...a.readingIds, readingId] }
                : a
            );
          } else {
            anomalyId = uid("a");
            const severity: Severity = judgment?.severity ?? input.severity;
            const description =
              judgment?.status === "alarm" && judgment.range
                ? `读数 ${input.value}${meta.unit}，${judgment.direction === "high" ? "高于" : "低于"}安全范围 ${judgment.range.min}~${judgment.range.max}${meta.unit}`
                : input.text!.trim();
            const created: Anomaly = {
              id: anomalyId,
              deviceId: input.deviceId,
              metric: input.metric,
              severity,
              title: `${meta.label}越限`,
              description,
              openedShiftId: shift.id,
              openedAt: ts,
              openedBy: input.operator || "未署名",
              readingIds: [readingId],
              status: "open",
            };
            anomalies = [...prev.anomalies, created];
          }
        }

        const reading: Reading = {
          id: readingId,
          shiftId: shift.id,
          deviceId: input.deviceId,
          metric: input.metric,
          value: input.value,
          text: input.text,
          operator: input.operator,
          ts,
          // 判定快照随读数永久保存，阈值日后修改不影响
          judgment,
          anomalyId,
        };

        return { ...prev, readings: [...prev.readings, reading], anomalies };
      });
    },
    []
  );

  /** 关闭异常：必须写清处理人和处理结果；读数恢复不会自动关闭 */
  const resolveAnomaly = useCallback(
    (anomalyId: string, handler: string, result: string) => {
      setData((prev) => ({
        ...prev,
        anomalies: prev.anomalies.map((a) =>
          a.id === anomalyId && a.status === "open"
            ? {
                ...a,
                status: "resolved",
                resolution: {
                  handler: handler.trim(),
                  result: result.trim(),
                  ts: nowTs(),
                },
              }
            : a
        ),
      }));
    },
    []
  );

  /** 轮机长调整某设备的安全范围；只影响此后录入的读数判定 */
  const updateRange = useCallback(
    (deviceId: string, metric: NumericMetric, range: Range) => {
      setData((prev) => ({
        ...prev,
        devices: prev.devices.map((d) =>
          d.id === deviceId
            ? { ...d, ranges: { ...d.ranges, [metric]: range } }
            : d
        ),
      }));
    },
    []
  );

  /**
   * 交班：把当时每台设备最严重的一条未完成异常冻结进班次摘要，
   * 随后开新班。之后阈值或异常状态变化都不改变已冻结的摘要。
   */
  const handover = useCallback(
    (fromOperator: string, note: string, nextSlot: string, nextDate: string) => {
      setData((prev) => {
        const current = prev.shifts.find((s) => s.id === prev.activeShiftId);
        if (!current || current.status !== "open") return prev;
        const snapshot: Handover = {
          ts: nowTs(),
          fromOperator: fromOperator.trim() || "未署名",
          items: buildHandoverItems(prev.anomalies, prev.devices),
          note: note.trim(),
        };
        const next: Shift = {
          id: uid("s"),
          label: `${nextDate} ${nextSlot}`,
          slot: nextSlot,
          date: nextDate,
          status: "open",
          openedAt: nowTs(),
        };
        return {
          ...prev,
          shifts: [
            ...prev.shifts.map((s) =>
              s.id === current.id ? { ...s, status: "closed" as const, handover: snapshot } : s
            ),
            next,
          ],
          activeShiftId: next.id,
        };
      });
    },
    []
  );

  const switchShift = useCallback((shiftId: string) => {
    setData((prev) => ({ ...prev, activeShiftId: shiftId }));
  }, []);

  const reset = useCallback(() => setData(resetData()), []);

  return {
    data,
    activeShift,
    addReading,
    resolveAnomaly,
    updateRange,
    handover,
    switchShift,
    reset,
  };
}
