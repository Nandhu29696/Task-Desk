// Small client page pieces (preview stagePill and svcChips).
import type { ReactNode } from "react";
import { STAGE, SVC } from "@/lib/constants";

export const StagePill = ({ st }: { st: string }) => <span className={`chip stage-${st}`}>{STAGE[st]}</span>;

export function SvcChips({ list }: { list: { line: string; type: string }[] }) {
  const keys = [...new Set(list.map((s) => s.line + ":" + s.type))];
  const out: ReactNode[] = [];
  keys.forEach((k, i) => {
    const [l, t] = k.split(":");
    if (i) out.push(" ");
    out.push(<span key={k} className="chip svc">{SVC[l]}{t === "ONE_TIME" ? " (one time)" : ""}</span>);
  });
  return <>{out}</>;
}
