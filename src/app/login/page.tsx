import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login">
      <section className="login-art">
        <div className="login-logo"><span><img src="/logo.png" alt="Search Engineers" /></span><b style={{ fontFamily: "var(--f-display)", fontSize: 22 }}>TaskDesk</b></div>
        <div>
          <p className="big">The daily rhythm of every client account, in one place.</p>
          <ul>
            <li><i style={{ background: "#EF4045" }} />Daily checks arrive on their own</li>
            <li><i style={{ background: "#FFFFFF" }} />Weekly and monthly work lands on the right day</li>
            <li><i style={{ background: "#EF4045" }} />Every month closes with a report</li>
          </ul>
        </div>
        <div style={{ fontSize: 13, color: "var(--side-mute)" }}>Search Engineers</div>
      </section>
      <section className="login-pick">
        <div><h1>Sign in</h1><p className="soft" style={{ marginTop: 4 }}>Use the email your admin or lead set up for you. Your sign in time is recorded for attendance.</p></div>
        <LoginForm />
      </section>
    </main>
  );
}
