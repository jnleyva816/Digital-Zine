"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { HANDLE_MAX, checkHandle, profilePath } from "@/lib/handles";
import { BIO_MAX } from "@/lib/profile-rules";
import { NAME_MAX } from "@/lib/signup";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20 aria-invalid:border-red-500";
const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";

interface Profile {
  handle: string | null;
  name: string | null;
  bio: string | null;
}

/**
 * The "Public profile" section of /account (DIG-111): handle, display name, and bio. The handle is
 * checked here with the same rules as the server, so most mistakes are explained before sending;
 * a handle someone else has comes back from the server and is shown on the field.
 */
export function ProfilePanel({ initial }: { initial: Profile }) {
  const ids = useId();
  const [saved, setSaved] = useState<Profile>(initial);
  const [handle, setHandle] = useState(initial.handle ?? "");
  const [name, setName] = useState(initial.name ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const bioLength = bio.replace(/\r\n?/g, "\n").trim().length;
  const bioLeft = BIO_MAX - bioLength;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving" || bioLeft < 0) return;
    setError(null);
    setHandleError(null);

    const body: Record<string, string> = {};
    if (handle.trim()) {
      const checked = checkHandle(handle);
      if (!checked.ok) {
        setHandleError(checked.error);
        setStatus("idle");
        return;
      }
      body.handle = checked.handle;
    }
    body.name = name;
    body.bio = bio;

    setStatus("saving");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { profile?: Profile; error?: string; code?: string } | null;
      if (res.ok && data?.profile) {
        setSaved(data.profile);
        setHandle(data.profile.handle ?? "");
        setName(data.profile.name ?? "");
        setBio(data.profile.bio ?? "");
        setStatus("saved");
        return;
      }
      const message = data?.error ?? "We could not save your profile. Try again in a moment.";
      if (data?.code?.startsWith("handle_")) setHandleError(message);
      else setError(message);
      setStatus("idle");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setStatus("idle");
    }
  }

  const changed = () => {
    if (status === "saved") setStatus("idle");
  };

  return (
    <section aria-labelledby={`${ids}-heading`} className="rounded-2xl border border-paper-300 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${ids}-heading`} className="font-serif text-xl font-bold text-ink-900">
          Public profile
        </h2>
        {saved.handle ? (
          <Link href={profilePath(saved.handle)} className="text-sm font-medium text-vermilion-600 underline hover:text-vermilion-500">
            View your profile
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-ink-700">
        {saved.handle
          ? "Readers see your name, bio, and published zines here. Your email is never shown."
          : "You have no public profile until you pick a handle. Your email is never shown."}
      </p>

      <form onSubmit={handleSubmit} noValidate aria-label="Public profile" className="mt-5 stack-y-4">
        <div>
          <label htmlFor={`${ids}-handle`} className={labelClass}>
            Handle
          </label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 mt-0.75 -translate-y-1/2 text-sm text-ink-500">
              @
            </span>
            <input
              id={`${ids}-handle`}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={HANDLE_MAX + 1}
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setHandleError(null);
                changed();
              }}
              aria-invalid={handleError ? true : undefined}
              aria-describedby={`${ids}-handle-help`}
              className={`${inputClass} pl-8`}
            />
          </div>
          <p id={`${ids}-handle-help`} className={`mt-1.5 text-xs ${handleError ? "text-red-700" : "text-ink-500"}`}>
            {handleError ??
              (saved.handle
                ? `Your profile is at /u/${saved.handle}. If you change it, the old address still leads here.`
                : "Letters, numbers, and underscores. Your profile will be at /u/your_handle.")}
          </p>
        </div>

        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Display name
          </label>
          <input
            id={`${ids}-name`}
            type="text"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${ids}-bio`} className={labelClass}>
            Bio
          </label>
          <textarea
            id={`${ids}-bio`}
            rows={3}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              changed();
            }}
            aria-invalid={bioLeft < 0 ? true : undefined}
            aria-describedby={`${ids}-bio-count`}
            className={inputClass}
          />
          <p id={`${ids}-bio-count`} aria-live="polite" className={`mt-1.5 text-xs ${bioLeft < 0 ? "text-red-700" : "text-ink-500"}`}>
            {bioLeft < 0 ? `${-bioLeft} characters over` : `${bioLeft} characters left`}
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "saving" || bioLeft < 0}
            className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-paper-50 shadow-xs hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Save profile"}
          </button>
          {status === "saved" ? (
            <p role="status" className="text-sm text-ink-700">
              Saved.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
