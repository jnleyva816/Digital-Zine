"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminZine, AdminZineFilter, AdminZinePage } from "@/lib/admin/admin-zines";
import { OFFLINE, badge, day, focusRing, plural, secondary } from "./styles";

const FILTERS: { value: AdminZineFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

const EMPTY: Record<AdminZineFilter, string> = { all: "No zines yet.", public: "No public zines.", private: "No private zines." };

interface ZineListProps {
  initial: AdminZinePage;
  initialStatus: AdminZineFilter;
  /** Only this person's zines. */
  owner?: { id: string; email: string } | null;
}

/** Every zine, for admins (DIG-138). A private zine is shown only as existing, never opened. */
export function ZineList({ initial, initialStatus, owner = null }: ZineListProps) {
  const [zines, setZines] = useState(initial.zines);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(next: AdminZineFilter, after: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const search = new URLSearchParams({ status: next });
      if (owner) search.set("owner", owner.id);
      if (after) search.set("cursor", after);
      const res = await fetch(`/api/admin/zines?${search}`);
      const body = (await res.json().catch(() => null)) as (AdminZinePage & { error?: string }) | null;
      if (!res.ok || !body?.zines) {
        setError(body?.error ?? "The list could not load. Try again in a moment.");
        return;
      }
      setZines((current) => {
        if (!after) return body.zines;
        const seen = new Set(current.map((z) => z.id));
        return [...current, ...body.zines.filter((z) => !seen.has(z.id))];
      });
      setCursor(body.nextCursor);
      setStatus(next);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {owner ? (
        <p className="mb-4 flex flex-wrap items-baseline gap-x-3 text-sm text-ink-700">
          <span className="break-all">Zines by {owner.email}</span>
          <Link href="/admin/zines" className={`font-medium text-vermilion-600 underline hover:text-vermilion-500 ${focusRing}`}>
            Show everyone’s zines
          </Link>
        </p>
      ) : null}
      <div role="group" aria-label="Show" className="inline-flex rounded-xl border border-paper-300 bg-white p-1 shadow-sm">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            disabled={busy}
            onClick={() => void load(value, null)}
            className={`min-h-9 rounded-lg px-3 text-sm ${focusRing} ${status === value ? "bg-ink-900 font-semibold text-paper-50" : "text-ink-700 hover:bg-paper-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {zines.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-paper-300 bg-white p-6 text-sm text-ink-700">{EMPTY[status]}</p>
      ) : (
        <ul aria-label="Zines" aria-busy={busy} className="mt-5 divide-y divide-paper-200 rounded-2xl border border-paper-300 bg-white shadow-sm">
          {zines.map((zine) => (
            <ZineRow key={zine.id} zine={zine} />
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="mt-5 text-center">
          <button type="button" disabled={busy} onClick={() => void load(status, cursor)} className={secondary}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ZineRow({ zine }: { zine: AdminZine }) {
  return (
    <li className="px-4 py-4 sm:px-5">
      <p className="break-words text-sm font-semibold text-ink-900">
        {zine.status === "private" ? (
          <span className="text-ink-700">Private zine</span>
        ) : zine.path ? (
          <Link href={zine.path} className={`underline decoration-paper-300 underline-offset-2 hover:decoration-ink-900 ${focusRing}`}>
            {zine.title}
          </Link>
        ) : (
          zine.title
        )}
      </p>
      <p className="break-all text-sm text-ink-700">{zine.owner.email}</p>
      <p className="mt-1 text-xs text-ink-500">
        {plural(zine.pageCount, "page")} · Created {day.format(new Date(zine.createdAt))} · Changed {day.format(new Date(zine.updatedAt))}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={badge}>{zine.status === "public" ? "Public" : "Private"}</span>
        {zine.status === "public" && zine.hidden ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-red-800">Hidden: owner deactivated</span>
        ) : null}
      </div>
    </li>
  );
}
