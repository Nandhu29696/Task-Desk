// Simple markdown for policies: "## " headings, "- " or "• " bullet lines, blank lines between paragraphs.
import type { ReactNode } from "react";

export function PolicyBody({ body }: { body: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={out.length} className="policy-list">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>); list = []; } };
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (l.startsWith("## ")) { flush(); out.push(<h3 key={out.length}>{l.slice(3)}</h3>); continue; }
    if (l.startsWith("- ") || l.startsWith("• ")) { list.push(l.slice(2)); continue; }
    flush(); out.push(<p key={out.length}>{l}</p>);
  }
  flush();
  return <div className="policy-body">{out}</div>;
}
