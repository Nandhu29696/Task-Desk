"use client";

import { useActionState } from "react";
import { login } from "../actions/auth";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack" style={{ maxWidth: 380 }}>
      <div><label className="lbl" htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" placeholder="name@searchengineers.in" /></div>
      <div><label className="lbl" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="field" /></div>
      {state?.error ? <div className="banner warn"><span>{state.error}</span></div> : null}
      <div><button className="btn btn-p" disabled={pending} style={{ width: "100%" }}>{pending ? "Signing in" : "Sign in"}</button></div>
      <p className="small muted">Forgot your password? Ask the admin or your lead to reset it.</p>
    </form>
  );
}
