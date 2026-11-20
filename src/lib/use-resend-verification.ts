"use client";

import { useState } from "react";

export type ResendState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "error"; message: string };

/** Asks for a fresh verification email (DIG-94). The server answers the same for every address. */
export function useResendVerification() {
  const [state, setState] = useState<ResendState>({ status: "idle" });

  async function resend(email: string) {
    setState({ status: "sending" });
    try {
      const res = await fetch("/api/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setState({ status: "sent" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setState({ status: "error", message: body?.error ?? "We could not send the email. Try again in a moment." });
    } catch {
      setState({ status: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  return { state, resend };
}
