import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { ADMIN_ONLY_ACTS, LOGCAT, LOGICON, OPEN, ROLE } from "@/lib/constants";
import { addK, fmtDate, fmtShort, fmtTime, fromLocal, hm2m, mins, stampOf } from "@/lib/dates";
import { actCat } from "@/lib/logic";
import { canSeeLog, isAdmin } from "@/lib/permissions";
import { AutoSubmit } from "@/components/client/ActionForm";
import { Icon } from "@/components/Icon";
import { Av, CommentText, Options, Stats } from "@/components/ui";

type Entry = { userId: string; at: string; cat: string; action: string; detail: string; taskId: string | null; projectId: string | null };
const RANGES: [string, string][] = [["0", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["ALL", "All time"]];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me, t0 = ctx.today, adm = isAdmin(u);

  const ppl = ctx.users.filter((x) => canSeeLog(u, x)).sort((a, b) => (a.id === u.id ? -1 : b.id === u.id ? 1 : a.name.localeCompare(b.name)));
  const many = ppl.length > 1;
  let who = sp.who || (many ? "ALL" : u.id);
  if (!many) who = u.id; else if (who !== "ALL" && !ppl.some((x) => x.id === who)) who = "ALL";
  const range = RANGES.some(([k]) => k === sp.range) ? sp.range! : "7";
  const cat = sp.cat && (sp.cat === "ALL" || LOGCAT[sp.cat]) ? sp.cat : "ALL";
  const q = (sp.q || "").trim();
  const limit = Math.max(80, Math.min(5000, Number(sp.limit) || 80));

  const ids = who === "ALL" ? ppl.map((x) => x.id) : [who];
  const from = range === "ALL" ? "" : range === "0" ? t0 : addK(t0, -Number(range));
  const since = from ? fromLocal(from) : undefined;
  const at = since ? { gte: since } : undefined;

  const [acts, cmts, sess, logs] = await Promise.all([
    prisma.activity.findMany({ where: { userId: { in: ids }, createdAt: at, action: { notIn: ["signed in", "signed out", "commented", ...(adm ? [] : ADMIN_ONLY_ACTS)] } }, orderBy: { createdAt: "desc" }, select: { userId: true, action: true, detail: true, taskId: true, projectId: true, createdAt: true } }),
    prisma.comment.findMany({ where: { userId: { in: ids }, createdAt: at }, select: { userId: true, body: true, taskId: true, createdAt: true, task: { select: { projectId: true } } } }),
    prisma.session.findMany({ where: { userId: { in: ids }, ...(from ? { OR: [{ day: { gte: from } }, { signedOutAt: { gte: since } }] } : {}) }, select: { userId: true, day: true, signedInAt: true, signedOutAt: true } }),
    prisma.timeLog.groupBy({ by: ["userId"], where: { userId: { in: ids }, workDate: { ...(from ? { gte: from } : {}), lte: t0 } }, _sum: { minutes: true } }),
  ]);

  const all: Entry[] = [];
  for (const a of acts) all.push({ userId: a.userId!, at: stampOf(a.createdAt)!, cat: actCat(a.action), action: a.action, detail: a.detail, taskId: a.taskId, projectId: a.projectId });
  for (const c of cmts) all.push({ userId: c.userId, at: stampOf(c.createdAt)!, cat: "COMMENT", action: "commented", detail: c.body, taskId: c.taskId, projectId: c.task.projectId });
  const signedDays = new Map<string, Set<string>>();
  for (const s of sess) {
    const inS = stampOf(s.signedInAt)!, outS = stampOf(s.signedOutAt);
    if (!from || inS.slice(0, 10) >= from) {
      all.push({ userId: s.userId, at: inS, cat: "ATT", action: "signed in", detail: "", taskId: null, projectId: null });
      const set = signedDays.get(s.userId) || new Set<string>(); set.add(inS.slice(0, 10)); signedDays.set(s.userId, set);
    }
    if (outS && (!from || outS.slice(0, 10) >= from)) all.push({ userId: s.userId, at: outS, cat: "ATT", action: "signed out", detail: inS.slice(0, 10) === outS.slice(0, 10) ? `after ${mins(Math.max(0, hm2m(outS.slice(11, 16)) - hm2m(inS.slice(11, 16))))}` : "", taskId: null, projectId: null });
  }
  all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const inRange = from ? all.filter((e) => e.at.slice(0, 10) >= from) : all;

  const taskIds = [...new Set(inRange.map((e) => e.taskId).filter((x): x is string => !!x))];
  const [tasks, projects] = await Promise.all([
    taskIds.length ? prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);
  const tmap = new Map(tasks.map((t) => [t.id, t])), pmap = new Map(projects.map((p) => [p.id, p]));

  const ql = q.toLowerCase();
  const list = inRange.filter((e) => (cat === "ALL" || e.cat === cat) && (!q || (e.action + " " + (e.detail || "") + " " + (e.taskId ? tmap.get(e.taskId)?.title || "" : "") + " " + (e.projectId ? pmap.get(e.projectId)?.name || "" : "") + " " + (ctx.user(e.userId)?.name || "")).toLowerCase().includes(ql)));
  const shown = list.slice(0, limit), multi = ids.length > 1;
  const days: [string, Entry[]][] = [];
  for (const e of shown) { const k = e.at.slice(0, 10); if (!days.length || days[days.length - 1][0] !== k) days.push([k, []]); days[days.length - 1][1].push(e); }
  const cnt = (c: string) => inRange.filter((e) => c === "ALL" || e.cat === c).length;
  const dayLabel = (k: string) => (k === t0 ? "Today" : k === addK(t0, -1) ? "Yesterday" : fmtDate(k));
  const minsBy = new Map(logs.map((l) => [l.userId, l._sum.minutes || 0]));
  const sumFor = (id: string) => { const es = inRange.filter((e) => e.userId === id); return { n: es.length, done: es.filter((e) => e.action === "completed task").length, mins: minsBy.get(id) || 0, days: signedDays.get(id)?.size || 0 }; };
  const tot = ids.map(sumFor).reduce((a, x) => ({ n: a.n + x.n, done: a.done + x.done, mins: a.mins + x.mins, days: a.days + x.days }), { n: 0, done: 0, mins: 0, days: 0 });
  const scope = adm ? "You can see everyone's activity." : u.role === "LEAD" ? "You can see your own activity and every member's." : "Your own activity. Only you, the leads and the admin can see it.";
  const sel1 = who === "ALL" ? null : ctx.user(who)!;
  const openCount = sel1 ? await prisma.task.count({ where: { assigneeId: sel1.id, status: { in: OPEN } } }) : 0;
  const names = ctx.users.flatMap((x) => [x.name, x.name.split(" ")[0]]);

  const href = (o: Record<string, string | number | undefined>) => {
    const v = { who: who === (many ? "ALL" : u.id) ? undefined : who, range: range === "7" ? undefined : range, cat: cat === "ALL" ? undefined : cat, q: q || undefined, ...o };
    const p = new URLSearchParams(); for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== "") p.set(k, String(x));
    const s = p.toString(); return "/activity" + (s ? "?" + s : "");
  };

  const logLine = (e: Entry, i: number) => {
    const tk = e.taskId ? tmap.get(e.taskId) : undefined, pj = e.projectId ? pmap.get(e.projectId) : undefined;
    const skipDetail = ["completed task", "created task", "reopened task"].includes(e.action) && tk;
    return (
      <li key={i} className="logi">
        <span className="logt num">{fmtTime(e.at.slice(11, 16))}</span>
        <span className={`logic l-${e.cat}`}><Icon name={LOGICON[e.cat]} /></span>
        <div className="logb">
          {multi ? <><Link className="link plink-b" href={href({ who: e.userId, limit: undefined })}>{ctx.user(e.userId)?.name || "System"}</Link> </> : null}
          <span>{e.action}</span>
          {tk ? <> <Link className="link" href={`/tasks/${tk.id}`}>{tk.title}</Link></> : pj ? <> in <Link className="link" href={`/projects/${pj.id}`}>{pj.name}</Link></> : null}
          {e.detail && !skipDetail ? <div className="logd" data-clamp="text">{e.cat === "COMMENT" ? <CommentText body={e.detail} names={names} /> : e.detail}</div> : null}
        </div>
      </li>
    );
  };

  return (
    <>
      <header className="between">
        <div><h1>Activity log</h1><p className="soft">{scope}</p></div>
        {sel1 ? <Link className="btn btn-q btn-sm" href={`/people/${sel1.id}`}><Icon name="people" /> View profile</Link> : null}
      </header>
      <Form action="/activity" className="panel pad row" style={{ alignItems: "flex-end" }}>
        {cat !== "ALL" ? <input type="hidden" name="cat" value={cat} /> : null}
        {many ? (
          <div style={{ minWidth: 220 }}><label className="lbl" htmlFor="al-w">Person</label>
            <AutoSubmit className="field" id="al-w" name="who" defaultValue={who}><Options opts={[["ALL", adm ? `Everyone (${ppl.length})` : `Me and all members (${ppl.length})`], ...ppl.map((x): [string, string] => [x.id, `${x.name}${x.id === u.id ? " (you)" : ""}, ${ROLE[x.role]}`])]} /></AutoSubmit></div>
        ) : <div><span className="lbl">Person</span><div className="field" style={{ background: "var(--sunk)" }}>{u.name} (you)</div></div>}
        <div style={{ minWidth: 160 }}><label className="lbl" htmlFor="al-r">Period</label><AutoSubmit className="field" id="al-r" name="range" defaultValue={range}><Options opts={RANGES} /></AutoSubmit></div>
        <div style={{ flex: 1, minWidth: 200 }}><label className="lbl" htmlFor="al-q">Search</label><input className="field" id="al-q" name="q" defaultValue={q} placeholder="Task, project, person or action, then press Enter" /></div>
      </Form>
      <Stats cls="four" items={[
        ["Entries", tot.n, "", range === "ALL" ? "all time" : range === "0" ? "today" : "last " + range + " days"],
        ["Tasks completed", tot.done, "t-moss"],
        ["Time logged", mins(tot.mins)],
        ["Days signed in", tot.days, "", multi ? `across ${ids.length} people` : ""],
      ]} />
      <div className="tgrid">
        <section className="panel tcard">
          <div className="tsec"><div className="seg seg-sm alcats" role="tablist" aria-label="Activity type">
            {["ALL", ...Object.keys(LOGCAT)].map((c) => <Link key={c} role="tab" href={href({ cat: c === "ALL" ? undefined : c })} aria-pressed={cat === c}>{c === "ALL" ? "All" : LOGCAT[c]} <span className="xs muted num">{cnt(c)}</span></Link>)}
          </div></div>
          <div className="tsec">
            {days.length ? days.map(([k, items]) => (
              <div key={k} className="logday"><h4>{dayLabel(k)}<span className="xs muted">{fmtShort(k)}</span></h4><ol className="loglist">{items.map(logLine)}</ol></div>
            )) : <p className="small muted">No activity in this period.</p>}
            {list.length > shown.length ? <div><Link className="btn btn-q btn-sm" href={href({ limit: limit + 80 })} scroll={false}>Show more ({list.length - shown.length} left)</Link></div> : null}
          </div>
        </section>
        <aside className="panel tside">
          {multi ? (
            <div className="tsec">
              <div className="tsh"><h3>By person</h3><span className="xs muted">entries, done, time</span></div>
              <div className="alppl" data-clamp="list">
                {ids.map((id) => [id, sumFor(id)] as const).sort((a, b) => b[1].n - a[1].n).map(([id, x]) => (
                  <Link key={id} className="alrow" href={href({ who: id })}><span className="person"><Av name={ctx.user(id)?.name || "?"} size={22} /><span className="tclip">{ctx.user(id)?.name}</span></span><span className="xs muted num">{x.n}, {x.done}, {mins(x.mins)}</span></Link>
                ))}
              </div>
            </div>
          ) : sel1 ? (
            <div className="tsec">
              <div className="tsh"><h3>{sel1.name}</h3></div>
              <p className="xs muted">{sel1.title || ROLE[sel1.role]}</p>
              <dl className="kv tkv"><dt>Tasks completed</dt><dd>{tot.done}</dd><dt>Time logged</dt><dd>{mins(tot.mins)}</dd><dt>Days signed in</dt><dd>{tot.days}</dd><dt>Open tasks</dt><dd>{openCount}</dd></dl>
              {many ? <Link className="link small" href={href({ who: "ALL" })}>Back to everyone</Link> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
