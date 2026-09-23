import { useMemo, useState } from "react";
import type { Device, DeviceRanges, ParamKey, Range } from "../types";
import { PARAM_META, PARAM_KEYS, fmtTime } from "../lib/domain";
import { useStore } from "../store";
import { Badge } from "./common";

/**
 * 值班台安全范围设置（仅轮机长可调）。
 * 调整只影响之后的录入：历史读数里的判定快照和已冻结交班摘要都不会改变。
 */
export function ThresholdPanel() {
  const { state, dispatch } = useStore();
  const isChief = state.role === "chief";

  const [deviceId, setDeviceId] = useState(state.devices[0]?.id ?? "");
  const device = state.devices.find((d) => d.id === deviceId);
  const ranges = (device && state.ranges[device.id]) || {};

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const revisions = useMemo(
    () =>
      state.revisions
        .filter((r) => r.deviceId === deviceId)
        .sort((a, b) => b.at - a.at),
    [state.revisions, deviceId]
  );

  const draftValue = (param: ParamKey, edge: keyof Range): string => {
    const key = `${param}.${edge}`;
    if (key in draft) return draft[key];
    return ranges[param] ? String(ranges[param]![edge]) : "";
  };

  const parseDraft = (): { ok: DeviceRanges; errors: string[] } => {
    const errors: string[] = [];
    const next: DeviceRanges = {};
    if (!device) return { ok: next, errors: ["请先选择设备"] };

    for (const param of device.params) {
      const min = parseFloat(draftValue(param, "min"));
      const max = parseFloat(draftValue(param, "max"));
      if (Number.isNaN(min) || Number.isNaN(max)) {
        errors.push(`${PARAM_META[param].label}的上下限都必须填写数字`);
        continue;
      }
      if (min >= max) {
        errors.push(`${PARAM_META[param].label}的下限必须小于上限`);
        continue;
      }
      next[param] = { min, max };
    }
    return { ok: next, errors };
  };

  const { errors } = parseDraft();

  const save = () => {
    setTouched(true);
    const { ok, errors: errs } = parseDraft();
    if (!device || errs.length > 0) return;
    dispatch({
      type: "updateRanges",
      deviceId: device.id,
      ranges: ok,
      note,
      at: Date.now(),
    });
    setDraft({});
    setNote("");
    setTouched(false);
  };

  return (
    <section className="panel" id="thresholds">
      <div className="heading">
        <div>
          <p>轮机长设置</p>
          <h2>按设备调整安全范围</h2>
        </div>
        <Badge tone={isChief ? "info" : "muted"}>{isChief ? "轮机长模式 · 可编辑" : "轮机员只读"}</Badge>
      </div>

      <div className="threshold-layout">
        <div>
          <div className="device-tabs">
            {state.devices.map((d: Device) => (
              <button
                key={d.id}
                className={d.id === deviceId ? "tab active" : "tab"}
                onClick={() => {
                  setDeviceId(d.id);
                  setDraft({});
                  setNote("");
                  setTouched(false);
                }}
              >
                {d.name}
              </button>
            ))}
          </div>

          {device ? (
            <>
              <table className="range-table">
                <thead>
                  <tr>
                    <th>参数</th>
                    <th>下限</th>
                    <th>上限</th>
                    <th>单位</th>
                  </tr>
                </thead>
                <tbody>
                  {device.params.map((param) => (
                    <tr key={param}>
                      <td>{PARAM_META[param].label}</td>
                      <td>
                        <input
                          type="number"
                          step={PARAM_META[param].step}
                          disabled={!isChief}
                          value={draftValue(param, "min")}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [`${param}.min`]: e.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step={PARAM_META[param].step}
                          disabled={!isChief}
                          value={draftValue(param, "max")}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [`${param}.max`]: e.target.value }))
                          }
                        />
                      </td>
                      <td>{PARAM_META[param].unit}</td>
                    </tr>
                  ))}
                  {device.params.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted-text">
                        该设备无数值型安全范围（舱底水按液位状态判定）。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {isChief && device.params.length > 0 && (
                <>
                  <label className="full-label">
                    <span>调整说明（随修订记录留痕）</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="如：冷却器清洗后上调水温上限"
                    />
                  </label>
                  {touched && errors.length > 0 && (
                    <ul className="form-errors">
                      {errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <div className="range-actions">
                    <button className="primary" onClick={save}>
                      保存新范围
                    </button>
                    <p className="hint">
                      新范围只对保存后的录入生效；已保存班次的判定与交班摘要不会改变。
                    </p>
                  </div>
                </>
              )}
              {!isChief && (
                <p className="hint">安全范围仅轮机长可调整，当前为只读视图。</p>
              )}
            </>
          ) : (
            <p className="hint">暂无可配置的设备。</p>
          )}
        </div>

        <div className="revision-box">
          <h3>范围修订记录</h3>
          {revisions.length === 0 && <p className="hint">暂无修订记录。</p>}
          <ul className="revision-list">
            {revisions.map((rev) => (
              <li key={rev.id}>
                <div className="revision-head">
                  <b>{fmtTime(rev.at)}</b>
                  <span>{rev.by}</span>
                </div>
                <p>{rev.note}</p>
                <div className="revision-ranges">
                  {PARAM_KEYS.filter((p) => rev.ranges[p]).map((p) => (
                    <span key={p} className="range-chip">
                      {PARAM_META[p].label} {rev.ranges[p]!.min}~{rev.ranges[p]!.max}
                      {PARAM_META[p].unit}
                    </span>
                  ))}
                  {Object.keys(rev.ranges).length === 0 && <span className="muted-text">无数值参数</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
