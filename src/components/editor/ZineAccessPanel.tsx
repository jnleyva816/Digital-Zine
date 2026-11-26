"use client";

import { useId, useState } from "react";
import { readApiError } from "@/components/board/types";
import { ACCESS_CODE_MAX, ACCESS_CODE_MIN } from "@/lib/zine-access-rules";

export interface ZineAccess {
  visibility: "public" | "private";
  hasAccessCode: boolean;
}

const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";

/**
 * Who can read a zine (DIG-112): anyone with the link, or only readers with the creator's code.
 * The code is sent once and stored as a hash, so the panel can only say that one is set.
 */
export function ZineAccessPanel({ zineId, initial }: { zineId: string; initial: ZineAccess }) {
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [code, setCode] = useState("");
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const keepsCode = visibility === "private" && saved.hasAccessCode && code.trim() === "";

  function problem(): string | null {
    if (visibility !== "private" || keepsCode) return null;
    const trimmed = code.trim();
    if (trimmed.length < ACCESS_CODE_MIN) return `The code needs at least ${ACCESS_CODE_MIN} characters.`;
    if (trimmed.length > ACCESS_CODE_MAX) return `The code can be at most ${ACCESS_CODE_MAX} characters.`;
    return null;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const found = problem();
    setCodeProblem(found);
    setStatus("");
    if (found) return;
    setError(null);
    setBusy(true);
    try {
      const body = visibility === "private" && !keepsCode ? { visibility, code } : { visibility };
      const res = await fetch(`/api/zines/${encodeURIComponent(zineId)}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not save who can read this zine."));
        return;
      }
      const next = (await res.json()) as ZineAccess;
      setSaved(next);
      setVisibility(next.visibility);
      setCode("");
      setStatus(next.visibility === "private" ? "Saved. The zine is private." : "Saved. The zine is public.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const descriptionIds = [`${id}-code-help`, codeProblem ? `${id}-code-problem` : null].filter(Boolean).join(" ");

  return (
    <form onSubmit={save} noValidate className="rounded-2xl border border-paper-300 bg-paper-50 p-4 sm:p-5">
      <fieldset>
        <legend className="font-serif text-lg font-semibold text-ink-900">Who can read it</legend>
        <div className="mt-3 stack-y-2">
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input
              type="radio"
              name={`${id}-visibility`}
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
              className="mt-1 accent-vermilion-500"
            />
            <span>
              <span className="font-semibold">Public</span>: anyone with the link. Listed on your profile and open to search engines.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-800">
            <input
              type="radio"
              name={`${id}-visibility`}
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
              className="mt-1 accent-vermilion-500"
            />
            <span>
              <span className="font-semibold">Private</span>: only people you give the code to. Not on your profile, in the sitemap, or in search.
            </span>
          </label>
        </div>
      </fieldset>

      {visibility === "private" ? (
        <div className="mt-4 stack-y-2">
          <label htmlFor={`${id}-code`} className={labelClass}>
            {saved.hasAccessCode ? "New access code" : "Access code"}
          </label>
          <input
            id={`${id}-code`}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={ACCESS_CODE_MAX}
            aria-invalid={codeProblem !== null}
            aria-describedby={descriptionIds}
            className="w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
          />
          <p id={`${id}-code-help`} className="text-xs text-ink-500">
            {saved.hasAccessCode
              ? "A code is set. Leave this empty to keep it. A new code signs out everyone who used the old code."
              : `${ACCESS_CODE_MIN} to ${ACCESS_CODE_MAX} characters. Share it with the people you want to read the zine.`}
          </p>
          {codeProblem ? (
            <p id={`${id}-code-problem`} className="text-xs text-vermilion-600">
              {codeProblem}
            </p>
          ) : null}
          <p className="rounded-xl border border-paper-300 bg-paper-100 p-3 text-xs text-ink-700">
            The code locks the zine&apos;s page. Its photos have addresses no one can guess, but anyone who already has a
            photo&apos;s address can still open that photo.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-vermilion-600">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="rounded-xl border border-ink-900 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-paper-200 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save access"}
        </button>
        <p role="status" className="text-sm text-ink-700">
          {status}
        </p>
      </div>
    </form>
  );
}
