import { useState } from "react";
import type { Anomaly } from "../types";
import { PARAM_META, fmtTime, sourceLabel } from "../lib/domain";
import { useStore } from "../store";

export function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "crit" | "muted" | "info";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const TONE_OF: Record<string, "ok" | "warn" | "crit" | "muted"> = {
  normal: "ok",
  warning: "warn",
  critical: "crit",
};

export function StatusBadge({ status }: { status: "normal" | "warning" | "critical" }) {
  return (
    <Badge tone={TONE_OF[status]}>
      {status === "normal" ? "正常" : status === "warning" ? "警告越限" : "严重越限"}
    </Badge>
  );
}

export function AnomalyCard({
  anomaly,
  deviceName,
  shiftLabel,
  canResolve,
  compact,
}: {
  anomaly: Anomaly;
  deviceName: string;
  shiftLabel?: string;
  canResolve: boolean;
  compact?: boolean;
}) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [handler, setHandler] = useState("");
  const [result, setResult] = useState("");

  const isOpen = anomaly.status === "open";

  return (
    <article className={`anomaly anomaly-${anomaly.severity} ${isOpen ? "" : "is-resolved"}`}>
      <div className="anomaly-head">
        <Badge tone={anomaly.severity === "critical" ? "crit" : "warn"}>
          {anomaly.severity === "critical" ? "严重" : "警告"}
        </Badge>
        <strong className="anomaly-title">{anomaly.description}</strong>
        {isOpen ? (
          <Badge tone="warn">未处理</Badge>
        ) : (
          <Badge tone="ok">已处理</Badge>
        )}
      </div>
      <div className="anomaly-meta">
        <span>{deviceName}</span>
        <span>{sourceLabel(anomaly.source)}</span>
        <span>发生 {fmtTime(anomaly.openedAt)}</span>
        {shiftLabel && <span>开启于 {shiftLabel}</span>}
        {anomaly.rangeSnapshot && anomaly.param && (
          <span>
            当时范围 {anomaly.rangeSnapshot.min}~{anomaly.rangeSnapshot.max}
            {PARAM_META[anomaly.param].unit}
          </span>
        )}
      </div>

      {anomaly.refs.length > 0 && (
        <ul className="anomaly-refs">
          {anomaly.refs.map((ref) => (
            <li key={ref.readingId}>
              <span className="ref-time">{fmtTime(ref.at)}</span>
              <span>{ref.detail}</span>
              {!compact && <Badge tone="muted">读数已恢复也不自动关闭</Badge>}
            </li>
          ))}
        </ul>
      )}

      {!isOpen && (
        <div className="anomaly-result">
          <p>
            <b>处理人：</b>
            {anomaly.handler}
            <span className="dot">·</span>
            <b>处理时间：</b>
            {anomaly.resolvedAt ? fmtTime(anomaly.resolvedAt) : "—"}
          </p>
          <p>
            <b>处理结果：</b>
            {anomaly.result}
          </p>
        </div>
      )}

      {isOpen && canResolve && (
        <div className="anomaly-actions">
          {!open ? (
            <button className="ghost" onClick={() => setOpen(true)}>
              填写处理人和处理结果
            </button>
          ) : (
            <div className="resolve-form">
              <label>
                <span>处理人 *</span>
                <input
                  value={handler}
                  onChange={(e) => setHandler(e.target.value)}
                  placeholder="如：王轮机"
                />
              </label>
              <label className="resolve-result">
                <span>处理结果 *</span>
                <textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={2}
                  placeholder="说明采取的措施与复查结论"
                />
              </label>
              <div className="resolve-btns">
                <button
                  className="primary"
                  disabled={!handler.trim() || !result.trim()}
                  onClick={() =>
                    dispatch({
                      type: "resolveAnomaly",
                      anomalyId: anomaly.id,
                      handler,
                      result,
                      at: Date.now(),
                    })
                  }
                >
                  确认处理完成
                </button>
                <button className="ghost" onClick={() => setOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
