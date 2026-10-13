// Shared constants. Labels here are what people see in the app.
export const ROLE: Record<string, string> = { ADMIN: "Admin", LEAD: "Lead", MEMBER: "Member" };
export const STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", WAITING: "Waiting on dependency", BLOCKED: "Blocked", IN_REVIEW: "In review", DONE: "Done", CANCELLED: "Cancelled" };
export const OPEN = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "IN_REVIEW"];
export const closed = (s: string) => s === "DONE" || s === "CANCELLED";
export const BOARD_COLS = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "IN_REVIEW", "DONE"];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const PRIORITY: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const PRANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export const FREQS = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ONCE"];
export const FREQ: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", ONCE: "One time" };
export const FORDER: Record<string, number> = { DAILY: 0, WEEKLY: 1, MONTHLY: 2, QUARTERLY: 3, ONCE: 4 };
export const LINES = ["SEO", "PPC", "CONTENT", "WEBDEV", "REPORTING", "GENERAL"];
export const TPL_LINES = ["SEO", "PPC", "CONTENT", "WEBDEV", "REPORTING"];
export const LINE: Record<string, string> = { SEO: "SEO", PPC: "Google Ads and PPC", CONTENT: "Content and social", WEBDEV: "Web development", REPORTING: "Client reporting", GENERAL: "General" };
export const INDUSTRIES = ["Healthcare", "Real estate", "Automotive", "Retail and ecommerce", "Education", "Finance and insurance", "Hospitality and travel", "Manufacturing", "Technology and SaaS", "Professional services", "Internal", "Other"];
export const PSTATUS: Record<string, string> = { ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" };
export const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const HTYPE: Record<string, string> = { PUBLIC: "Public holiday", RESTRICTED: "Restricted holiday", COMPANY: "Company holiday" };
export const EMPTYPE: Record<string, string> = { ON_ROLE: "On role", ASSOCIATE: "Associate" };
export const STAGES = ["LEAD", "PROPOSAL", "NEGOTIATION", "ONBOARDING", "ACTIVE", "ON_HOLD", "COMPLETED", "CHURNED"];
export const STAGE: Record<string, string> = { LEAD: "Lead", PROPOSAL: "Proposal sent", NEGOTIATION: "Negotiation", ONBOARDING: "Onboarding", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CHURNED: "Churned" };
export const LIVE_STAGES = ["ACTIVE", "ONBOARDING"];
export const CYCLE: Record<string, string> = { MONTHLY: "per month", QUARTERLY: "per quarter", YEARLY: "per year", ONE_TIME: "one time" };
export const SVC_LINES = ["SEO", "PPC", "CONTENT", "WEBDEV", "AMC", "REPORTING", "OTHER", "DOMAIN", "HOSTING"];
export const PRODUCT_LINES = ["DOMAIN", "HOSTING"];
export const RENEW_LINES = ["AMC", "DOMAIN", "HOSTING"];
export const toProjLine = (l: string) => ({ OTHER: "GENERAL", AMC: "WEBDEV", DOMAIN: "WEBDEV", HOSTING: "WEBDEV" } as Record<string, string>)[l] || l;
export const SVC: Record<string, string> = { SEO: "SEO", PPC: "Google Ads", CONTENT: "Content and social", WEBDEV: "Web development", REPORTING: "Reporting and analytics", OTHER: "Other services", AMC: "Website AMC", DOMAIN: "Domain", HOSTING: "Hosting" };
export const COMMS: Record<string, string> = { CALL: "Phone call", WHATSAPP: "WhatsApp group", EMAIL: "Email", VISIT: "Direct visit" };
export const ACCESS: Record<string, string> = { NONE: "Hidden", LOGIN: "Login only", FULL: "Full access" };
export const TOOLCATS = ["SEO", "Analytics", "Advertising", "Content and design", "Development and hosting", "Communication", "Productivity", "Others"];
export const TACCESS: Record<string, string> = { OWN: "Own login", SHARED: "Shared login, ask admin", FREE: "Free, no login" };
export const TVIS: Record<string, string> = { ADMIN: "Admin only", LEAD: "Leads and admin", ALL: "Everyone" };
export const LTYPE: Record<string, string> = { CASUAL: "Casual leave", SICK: "Sick leave", EARNED: "Earned leave", COMPOFF: "Comp off", UNPAID: "Unpaid leave", RH: "Restricted holiday" };
export const LSTATUS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };
export const PERIOD: Record<string, string> = { DAY: "Daily", WEEK: "Weekly", MONTH: "Monthly", QUARTER: "Quarterly" };
export const NKINDS = ["ASSIGNED", "MENTION", "APPROVAL", "LEAVE", "RENEWAL", "POLICY", "ANNOUNCE", "UPDATE"];
export const NICON: Record<string, string> = { ASSIGNED: "tasks", MENTION: "at", APPROVAL: "check", ANNOUNCE: "megaphone", LEAVE: "leave", RENEWAL: "clients", POLICY: "policies", UPDATE: "bell" };
export const ADMIN_ONLY_ACTS = ["added client", "moved client", "moved client to live", "renewed", "renewal reminder created", "updated leave allowances"];
export const LOGCAT: Record<string, string> = { TASK: "Tasks", COMMENT: "Comments", TIME: "Time", ATT: "Attendance and leave", OTHER: "Other" };
export const LOGICON: Record<string, string> = { TASK: "tasks", COMMENT: "at", TIME: "attendance", ATT: "calendar", OTHER: "more" };
export const SLOT: Record<string, string> = { MORNING: "Morning", AFTERNOON: "Afternoon", EVENING: "Evening" };
export const DAY_CAPACITY = 480;
export const DEFAULT_SETTINGS = { sundayOff: true, satRule: "SECOND_FOURTH", allow: { CASUAL: 12, SICK: 12, EARNED: 15 } as Record<string, number>, rhLimit: 2 };
export type Settings = typeof DEFAULT_SETTINGS;

type TplRow = [string, string, string, string, { weekday?: number; monthDay?: number; dueOffsetDays?: number; checklist?: string[] }, string, number, string?];
export type Template = { key: string; line: string; title: string; frequency: string; weekday: number | null; monthDay: number | null; dueOffsetDays: number; checklist: string[]; priority: string; est: number; description: string };
export const TEMPLATES: Template[] = ([
  ["seo_gsc_check","SEO","Check Search Console for coverage errors and manual actions","DAILY",{},"MEDIUM",15,"Open GSC, review Pages and Manual actions. Note any new errors in the comments."],
  ["seo_rank_watch","SEO","Watch rank tracker for drops of 5 or more positions","DAILY",{},"MEDIUM",15],
  ["seo_rank_review","SEO","Weekly keyword ranking review and notes","WEEKLY",{weekday:1},"MEDIUM",45],
  ["seo_links","SEO","Link building outreach (find and pitch 5 prospects)","WEEKLY",{weekday:3},"MEDIUM",120],
  ["seo_onpage","SEO","Ship one on page optimisation (titles, meta, headings, internal links)","WEEKLY",{weekday:5},"MEDIUM",60],
  ["seo_crawl","SEO","Technical SEO crawl and fix list","MONTHLY",{monthDay:5,checklist:["Run the crawl","Export issues","Prioritise fixes","Share the list with the developer"]},"HIGH",180],
  ["seo_backlink_audit","SEO","Backlink profile audit and toxic link review","MONTHLY",{monthDay:10},"MEDIUM",60],
  ["seo_cwv","SEO","Core Web Vitals and page speed check","MONTHLY",{monthDay:15},"MEDIUM",45],
  ["seo_competitor","SEO","Competitor keyword and content gap analysis","QUARTERLY",{monthDay:1},"MEDIUM",240],
  ["seo_pruning","SEO","Content pruning and refresh plan","QUARTERLY",{monthDay:20},"LOW",120],
  ["seo_initial_audit","SEO","Initial technical SEO audit","ONCE",{dueOffsetDays:0},"HIGH",300],
  ["seo_tracking_setup","SEO","Set up GA4, Search Console and rank tracking","ONCE",{dueOffsetDays:3},"HIGH",90],
  ["seo_keyword_map","SEO","Keyword research and page mapping","ONCE",{dueOffsetDays:7},"HIGH",240],
  ["ppc_pacing","PPC","Check budget pacing and spend anomalies","DAILY",{},"HIGH",15],
  ["ppc_disapprovals","PPC","Review disapproved ads and policy alerts","DAILY",{},"MEDIUM",10],
  ["ppc_search_terms","PPC","Search term report review and negative keywords","WEEKLY",{weekday:1,checklist:["Export search terms","Add negative keywords","Add new keyword ideas"]},"HIGH",45],
  ["ppc_bids","PPC","Bid strategy and target CPA or ROAS review","WEEKLY",{weekday:4},"MEDIUM",45],
  ["ppc_ad_tests","PPC","Ad copy test review and new variants","MONTHLY",{monthDay:3},"MEDIUM",60],
  ["ppc_conv_audit","PPC","Conversion tracking audit","MONTHLY",{monthDay:7},"HIGH",45],
  ["ppc_structure","PPC","Account structure and audience review","QUARTERLY",{monthDay:10},"MEDIUM",180],
  ["ppc_initial_audit","PPC","Account audit and conversion tracking setup","ONCE",{dueOffsetDays:0},"HIGH",240],
  ["ppc_launch","PPC","Launch initial campaigns","ONCE",{dueOffsetDays:5},"HIGH",240],
  ["content_social","CONTENT","Social media posting and engagement","DAILY",{},"MEDIUM",30],
  ["content_calendar","CONTENT","Content calendar check and briefs for the week","WEEKLY",{weekday:1},"MEDIUM",30],
  ["content_blog","CONTENT","Write and publish blog post","WEEKLY",{weekday:4,checklist:["Brief and outline","First draft","SEO checks","Publish and share"]},"MEDIUM",180],
  ["content_refresh","CONTENT","Refresh two underperforming posts","MONTHLY",{monthDay:20},"LOW",120],
  ["content_social_plan","CONTENT","Plan next month's social calendar","MONTHLY",{monthDay:25},"MEDIUM",60],
  ["content_audit","CONTENT","Content audit and topic cluster plan","ONCE",{dueOffsetDays:0},"HIGH",240],
  ["web_uptime","WEBDEV","Check site uptime, forms and error logs","DAILY",{},"MEDIUM",10],
  ["web_updates","WEBDEV","Update CMS core, plugins and themes","WEEKLY",{weekday:2,checklist:["Back up the site","Update on staging","Test key pages and forms","Push to live"]},"MEDIUM",45],
  ["web_backup","WEBDEV","Verify backups and restore point","WEEKLY",{weekday:5},"MEDIUM",15],
  ["web_security","WEBDEV","Security scan and SSL certificate check","MONTHLY",{monthDay:10},"HIGH",45],
  ["web_speed","WEBDEV","Page speed and broken link audit","MONTHLY",{monthDay:20},"MEDIUM",60],
  ["web_renewals","WEBDEV","Hosting, domain and licence renewal review","QUARTERLY",{monthDay:15},"MEDIUM",30],
  ["web_handover","WEBDEV","Website handover: access, backups and staging setup","ONCE",{dueOffsetDays:0},"HIGH",120],
  ["rep_weekly_email","REPORTING","Weekly client update email","WEEKLY",{weekday:5},"MEDIUM",20],
  ["rep_monthly_report","REPORTING","Prepare monthly performance report","MONTHLY",{monthDay:3,checklist:["Pull GA4 and Search Console data","Update rank and traffic charts","Write wins, issues and next steps","Send the report to the client"]},"HIGH",120],
  ["rep_monthly_call","REPORTING","Monthly client review call","MONTHLY",{monthDay:5},"HIGH",60],
  ["rep_qbr","REPORTING","Quarterly business review deck","QUARTERLY",{monthDay:7},"HIGH",180],
  ["rep_kickoff","REPORTING","Kickoff call and KPI agreement","ONCE",{dueOffsetDays:0},"HIGH",60],
] as TplRow[]).map(([key, line, title, frequency, x, priority, est, description]) => ({ key, line, title, frequency, weekday: x.weekday ?? null, monthDay: x.monthDay ?? null, dueOffsetDays: x.dueOffsetDays ?? 0, checklist: x.checklist || [], priority, est, description: description || "" }));

export const HOLIDAY_LIST: [string, string, string][] = [["2025-12-25","Christmas Day","PUBLIC"],["2025-12-26","Additional Festival Leave","RESTRICTED"],["2026-01-01","New Year's Day","PUBLIC"],["2026-01-15","Pongal","PUBLIC"],["2026-01-16","Thiruvalluvar Day","PUBLIC"],["2026-01-17","Uzhavar Thirunal","PUBLIC"],["2026-01-26","Republic Day","PUBLIC"],["2026-02-17","Maha Shivaratri","RESTRICTED"],["2026-03-04","Holi","RESTRICTED"],["2026-03-19","Telugu New Year's Day","RESTRICTED"],["2026-03-21","Ramzan (Id ul Fitr)","PUBLIC"],["2026-03-31","Mahavir Jayanti","PUBLIC"],["2026-04-03","Good Friday","RESTRICTED"],["2026-04-14","Dr. B. R. Ambedkar's Birthday and Tamil New Year","PUBLIC"],["2026-05-01","May Day","PUBLIC"],["2026-05-28","Bakrid (Id ul Azha)","RESTRICTED"],["2026-06-26","Muharram","RESTRICTED"],["2026-08-15","Independence Day","PUBLIC"],["2026-08-26","Milad un Nabi","RESTRICTED"],["2026-09-04","Krishna Jayanthi","RESTRICTED"],["2026-09-14","Vinayagar Chathurthi","PUBLIC"],["2026-10-02","Gandhi Jayanthi","PUBLIC"],["2026-10-19","Ayudha Pooja","PUBLIC"],["2026-10-20","Vijayadasami","PUBLIC"],["2026-11-09","Deepavali Additional Holiday","RESTRICTED"],["2026-12-25","Christmas Day","PUBLIC"]];
