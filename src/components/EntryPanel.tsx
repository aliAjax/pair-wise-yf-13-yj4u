import { useMemo, useState } from "react";
import type { BilgeLevel, Device } from "../types";
import { PARAM_META, bilgeText, currentRangesFor, evaluate } from "../lib/domain";
import { useStore } from "../store";
import { Badge, StatusBadge } from "./common";

type NumFields = Record<string, string>;

export function EntryPanel({
  deviceId,
  onPickDevice,
}: {
  deviceId: string | null;
  onPickDevice: (id: string) => void;
}) {
  const { state, dispatch } = useStore();
  const current = state.shifts.find((s) => s.id === state.currentShiftId) ?? null;
  const device: Device | undefined =
    state.devices.find((d) => d.id === deviceId) ?? state.devices[0];

  const [nums, setNums] = useState<NumFields>({});
  const [bilge, setBilge] = useState<BilgeLevel>("normal");
  const [note, setNote] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const ranges = device ? currentRangesFor(state, device.id) : {};

  const previews = useMemo(() => {
    if (!device) return [];
    return device.params
      .map((param) => {
        const raw = nums[param];
        if (raw === undefined || raw.trim() === "") return null;
        const value = parseFloat(raw);
        if (Number.isNaN(value) || !ranges[param]) return null;
        return evaluate(param, value, ranges[param]!);
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [device, nums, ranges]);

  if (!device) {
    return (
      <section className="panel" id="entry">
        <h2>参数录入</h2>
        <p className="hint">暂无可录入的设备。</p>
      </section>
    );
  }

  const setNum = (param: string, raw: string) => setNums((m) => ({ ...m, [param]: raw }));

  const reset = () => {
    setNums({});
    setBilge("normal");
    setNote("");
  };

  const save = () => {
    if (!current) return;
    const values = {
      rpm: parseOrUndef(nums.rpm),
      oilPressure: parseOrUndef(nums.oilPressure),
      coolantTemp: parseOrUndef(nums.coolantTemp),
      fuelConsumption: parseOrUndef(nums.fuelConsumption),
      bilge: device.bilge ? bilge : undefined,
    };
    dispatch({ type: "addReading", deviceId: device.id, values, note, at: Date.now() });
    setLastSaved(`已保存 ${device.name} 读数，按当前范围判定（${current.label}）`);
    reset();
  };

  const anyValue =
    device.params.some((p) => nums[p] !== undefined && nums[p].trim() !== "") ||
    nums.fuelConsumption !== undefined && nums.fuelConsumption.trim() !== "" ||
    (device.bilge && bilge !== "normal");

  const bilgeTone = bilge === "high" ? "crit" : bilge === "near" ? "warn" : "ok";

  return (
    <section className="panel" id="entry">
      <div className="heading">
        <div>
          <p>轮机员录入</p>
          <h2>机舱参数读数</h2>
        </div>
        {current ? <Badge tone="info">{current.label} 进行中</Badge> : <Badge tone="muted">未开班</Badge>}
      </div>

      <div className="device-tabs">
        {state.devices.map((d) => (
          <button
            key={d.id}
            className={d.id === device.id ? "tab active" : "tab"}
            onClick={() => {
              onPickDevice(d.id);
              reset();
            }}
          >
            {d.name}
          </button>
        ))}
      </div>

      {!current && (
        <p className="form-errors-inline">当前没有进行中的班次，请先开班再录入读数。</p>
      )}

      <div className="entry-grid">
        {device.params.map((param) => (
          <label key={param}>
            <span>
              {PARAM_META[param].label}（{PARAM_META[param].unit}）
              {ranges[param] && (
                <em className="range-hint">
                  当前范围 {ranges[param]!.min}~{ranges[param]!.max}
                </em>
              )}
            </span>
            <input
              type="number"
              step={PARAM_META[param].step}
              disabled={!current}
              value={nums[param] ?? ""}
              onChange={(e) => setNum(param, e.target.value)}
              placeholder={`按当前范围 ${ranges[param]?.min ?? "?"}~${ranges[param]?.max ?? "?"} 判定`}
            />
          </label>
        ))}

        <label>
          <span>燃油消耗（L/h，仅记录不判定）</span>
          <input
            type="number"
            step="0.1"
            disabled={!current}
            value={nums.fuelConsumption ?? ""}
            onChange={(e) => setNum("fuelConsumption", e.target.value)}
            placeholder="如 31.5"
          />
        </label>

        {device.bilge && (
          <label>
            <span>舱底水液位状态</span>
            <select
              value={bilge}
              disabled={!current}
              onChange={(e) => setBilge(e.target.value as BilgeLevel)}
            >
              <option value="normal">正常</option>
              <option value="near">接近警戒线（预警，不生成异常）</option>
              <option value="high">高位报警（生成严重异常）</option>
            </select>
          </label>
        )}

        <label className="entry-note">
          <span>备注</span>
          <input
            disabled={!current}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：转速已恢复，继续观察"
          />
        </label>
      </div>

      {(previews.length > 0 || (device.bilge && bilge !== "normal")) && (
        <div className="preview-box">
          <p className="preview-title">按当前安全范围的实时预览：</p>
          {previews.map((ev) => (
            <div key={ev.param} className="preview-row">
              <StatusBadge status={ev.status} />
              <span>
                {PARAM_META[ev.param].label} {ev.value}
                {ev.unit}（范围 {ev.range.min}~{ev.range.max}
                {ev.unit}
                {ev.status !== "normal" && `，超出 ${ev.excess}${ev.unit}`}）
              </span>
            </div>
          ))}
          {device.bilge && bilge !== "normal" && (
            <div className="preview-row">
              <Badge tone={bilgeTone}>{bilge === "high" ? "严重" : "警告"}</Badge>
              <span>舱底水{bilgeText(bilge)}</span>
            </div>
          )}
          <p className="hint">保存后该判定与所用范围会一并冻结到读数中，之后调整阈值不会回改。</p>
        </div>
      )}

      <div className="entry-actions">
        <button className="primary" disabled={!current || !anyValue} onClick={save}>
          保存读数
        </button>
        <button className="ghost" onClick={reset} disabled={!current}>
          清空
        </button>
        {lastSaved && <span className="saved-hint">{lastSaved}</span>}
      </div>
    </section>
  );
}

function parseOrUndef(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const v = parseFloat(raw);
  return Number.isNaN(v) ? undefined : v;
}
