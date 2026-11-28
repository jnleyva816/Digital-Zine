"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { AdminUser, AdminUserPage } from "@/lib/admin/admin-users";
import { OFFLINE, badge, day, focusRing, plural, primary, secondary } from "./styles";

interface UserListProps {
  initial: AdminUserPage;
  adminId: string;
  /** The admin has a password, which confirms a change. */
  hasPassword: boolean;
  /** The admin signed in within the last five minutes, which confirms a change without a password. */
  recentSignIn: boolean;
}

/** The admin panel's people: search, page, and the admin role (DIG-136). */
export function UserList({ initial, adminId, hasPassword, recentSignIn }: UserListProps) {
  const [users, setUsers] = useState(initial.users);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [typed, setTyped] = useState("");
  /** The search the list shows, which "Load more" continues. */
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<{ id: string; kind: ActionKind } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  useEffect(() => {
    if (focusNotice > 0) statusRef.current?.focus();
  }, [focusNotice]);

  async function load(kind: "search" | "more", q: string, after: string | null) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setNotice("");
    try {
      const search = new URLSearchParams({ q });
      if (after) search.set("cursor", after);
      const res = await fetch(`/api/admin/users?${search}`);
      const body = (await res.json().catch(() => null)) as (AdminUserPage & { error?: string }) | null;
      if (!res.ok || !body?.users) {
        setError(body?.error ?? "The list could not load. Try again in a moment.");
        return;
      }
      setUsers((current) => {
        if (kind === "search") return body.users;
        const seen = new Set(current.map((u) => u.id));
        return [...current, ...body.users.filter((u) => !seen.has(u.id))];
      });
      setCursor(body.nextCursor);
      setQuery(q);
      if (kind === "search") setOpen(null);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  function done(user: AdminUser, { kind, billing }: ActionResult) {
    const update = (patch: Partial<AdminUser>) => setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, ...patch } : u)));
    setOpen(null);
    if (kind === "grant" || kind === "revoke") {
      update({ role: kind === "grant" ? "admin" : "user" });
      setNotice(kind === "grant" ? `${user.email} is now an admin.` : `${user.email} is no longer an admin.`);
    } else if (kind === "deactivate") {
      update({ deactivated: true });
      setNotice(
        billing === "unavailable" || billing === "failed"
          ? `${user.email} is deactivated, but their subscription could not be stopped. Cancel it in the Stripe Dashboard.`
          : `${user.email} is deactivated.${billing === "cancelling" ? " Their subscription ends with the paid period." : ""}`
      );
    } else if (kind === "reactivate") {
      update({ deactivated: false });
      setNotice(`${user.email} can sign in again.`);
    } else {
      setUsers((current) => current.filter((u) => u.id !== user.id));
      setNotice(`${user.email} was deleted.`);
      // Their row and its buttons are gone; the message takes focus instead.
      setFocusNotice((n) => n + 1);
    }
  }

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void load("search", typed.trim(), null);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="search"
          aria-label="Search by name or email"
          placeholder="Name or email"
          maxLength={200}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
        />
        <button type="submit" disabled={busy !== null} className={primary}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>

      <p ref={statusRef} tabIndex={-1} role="status" className={notice ? `mt-3 break-words rounded text-sm text-ink-700 ${focusRing}` : "sr-only"}>
        {notice}
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {users.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-paper-300 bg-white p-6 text-sm text-ink-700">
          {query ? `No one matches “${query}”.` : "There are no users yet."}
        </p>
      ) : (
        <ul aria-label="Users" className="mt-5 divide-y divide-paper-200 rounded-2xl border border-paper-300 bg-white shadow-sm">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              self={user.id === adminId}
              open={open?.id === user.id ? open.kind : null}
              onOpen={(kind) => {
                setNotice("");
                setOpen({ id: user.id, kind });
              }}
              onClose={() => setOpen(null)}
              onDone={(result) => done(user, result)}
              hasPassword={hasPassword}
              recentSignIn={recentSignIn}
            />
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="mt-5 text-center">
          <button type="button" disabled={busy !== null} onClick={() => void load("more", query, cursor)} className={secondary}>
            {busy === "more" ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type ActionKind = "grant" | "revoke" | "deactivate" | "reactivate" | "delete";

const ACTIONS: Record<ActionKind, { label: (email: string) => string; open: string; submit: string; busy: string; explain: string }> = {
  grant: {
    label: (e) => `Make ${e} an admin`,
    open: "Make admin…",
    submit: "Make admin",
    busy: "Saving…",
    explain: "Admins can see every user, change who is an admin, and deactivate or delete accounts. They get Pro features without paying.",
  },
  revoke: {
    label: (e) => `Remove admin role from ${e}`,
    open: "Remove admin role…",
    submit: "Remove admin role",
    busy: "Saving…",
    explain: "They keep their account and zines, and lose the admin panel and free Pro features at once.",
  },
  deactivate: {
    label: (e) => `Deactivate ${e}`,
    open: "Deactivate…",
    submit: "Deactivate",
    busy: "Deactivating…",
    explain:
      "They are signed out everywhere and cannot sign in. Their public zines are hidden. A paid subscription ends with the paid period, with no refund. You can reactivate them later.",
  },
  reactivate: {
    label: (e) => `Reactivate ${e}`,
    open: "Reactivate…",
    submit: "Reactivate",
    busy: "Reactivating…",
    explain: "They can sign in again and their public zines return. A subscription that was ended is not resumed.",
  },
  delete: {
    label: (e) => `Delete ${e}`,
    open: "Delete…",
    submit: "Delete permanently",
    busy: "Deleting…",
    explain:
      "Removes their account, boards, photos, zines, and recipes, and cancels any subscription at once with no refund. This cannot be undone.",
  },
};

/** The actions an admin may take on someone (owner, 25 Nov): an admin's role must go before anything else. */
function actionsFor(user: AdminUser, self: boolean): ActionKind[] {
  if (self) return [];
  if (user.role === "admin") return ["revoke"];
  if (user.deactivated) return ["reactivate", "delete"];
  return [...(user.verified ? (["grant"] as const) : []), "deactivate", "delete"];
}

/** What the server said a finished action did. */
export interface ActionResult {
  kind: ActionKind;
  billing?: "none" | "cancelling" | "unavailable" | "failed";
}

interface UserRowProps {
  user: AdminUser;
  self: boolean;
  open: ActionKind | null;
  onOpen: (kind: ActionKind) => void;
  onClose: () => void;
  onDone: (result: ActionResult) => void;
  hasPassword: boolean;
  recentSignIn: boolean;
}

function UserRow({ user, self, open, onOpen, onClose, onDone, hasPassword, recentSignIn }: UserRowProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  // The buttons come back when the form closes; so does focus.
  useEffect(() => {
    if (wasOpen.current && !open) actionsRef.current?.querySelector("button")?.focus();
    wasOpen.current = open !== null;
  }, [open]);

  const actions = actionsFor(user, self);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          {user.name ? <p className="break-words text-sm font-semibold text-ink-900">{user.name}</p> : null}
          <p className="break-all text-sm text-ink-700">{user.email}</p>
          <p className="mt-1 text-xs text-ink-500">
            Joined {day.format(new Date(user.createdAt))} ·{" "}
            {user.zineCount > 0 ? (
              <Link href={`/admin/zines?owner=${encodeURIComponent(user.id)}`} className={`underline hover:text-ink-900 ${focusRing}`}>
                {plural(user.zineCount, "zine")}
              </Link>
            ) : (
              plural(user.zineCount, "zine")
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {self ? <span className={badge}>You</span> : null}
            {user.role === "admin" ? <span className={badge}>Admin</span> : null}
            <span className={badge}>{user.tier === "pro" ? "Pro" : "Free"}</span>
            {user.verified ? null : <span className={badge}>Email not verified</span>}
            {user.deactivated ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-red-800">Deactivated</span> : null}
          </div>
        </div>
        {actions.length > 0 && !open ? (
          <div ref={actionsRef} className="flex flex-wrap gap-2">
            {actions.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onOpen(kind)}
                aria-label={ACTIONS[kind].label(user.email)}
                className={kind === "delete" ? `${secondary} text-red-700` : secondary}
              >
                {ACTIONS[kind].open}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {open ? <ActionForm kind={open} user={user} onClose={onClose} onDone={onDone} hasPassword={hasPassword} recentSignIn={recentSignIn} /> : null}
    </li>
  );
}

const fieldClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20 sm:max-w-sm";
const fieldLabel = "block font-mono text-xs uppercase tracking-wider text-ink-700";

function request(kind: ActionKind, user: AdminUser, extra: Record<string, string>): [string, Record<string, string>] {
  const base = `/api/admin/users/${user.id}`;
  if (kind === "grant" || kind === "revoke") return [`${base}/role`, { role: kind === "grant" ? "admin" : "user", ...extra }];
  if (kind === "delete") return [`${base}/delete`, extra];
  return [`${base}/status`, { action: kind, ...extra }];
}

interface ActionFormProps extends Pick<UserRowProps, "user" | "onClose" | "onDone" | "hasPassword" | "recentSignIn"> {
  kind: ActionKind;
}

function ActionForm({ kind, user, onClose, onDone, hasPassword, recentSignIn }: ActionFormProps) {
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(!hasPassword && !recentSignIn);
  const firstRef = useRef<HTMLInputElement & HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), [needsSignIn]);

  const action = ACTIONS[kind];
  const confirmed = kind !== "delete" || typed.trim().toLowerCase() === user.email.toLowerCase();
  const ready = confirmed && (!hasPassword || password.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !ready) return;
    setSaving(true);
    setError(null);
    try {
      const extra: Record<string, string> = {};
      if (kind === "delete") extra.email = typed;
      if (hasPassword) extra.password = password;
      const [url, body] = request(kind, user, extra);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const answer = (await res.json().catch(() => null)) as { error?: string; code?: string; billing?: ActionResult["billing"] } | null;
      if (res.ok) return onDone({ kind, billing: answer?.billing });
      if (answer?.code === "reauth_required" && !hasPassword) setNeedsSignIn(true);
      else setError(answer?.error ?? "That did not work. Try again in a moment.");
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={action.label(user.email)} className="mt-4 space-y-3 rounded-xl border border-paper-300 bg-paper-100 p-4">
      <p className="text-sm text-ink-700">{action.explain}</p>
      {needsSignIn ? (
        <p className="text-sm text-ink-700">For security, sign in once more, then come back here within five minutes.</p>
      ) : (
        <>
          {kind === "delete" ? (
            <div>
              <label htmlFor={`confirm-email-${user.id}`} className={fieldLabel}>
                Type their email address to confirm
              </label>
              <input
                ref={hasPassword ? undefined : firstRef}
                id={`confirm-email-${user.id}`}
                type="email"
                autoComplete="off"
                maxLength={254}
                placeholder={user.email}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className={fieldClass}
              />
            </div>
          ) : null}
          {hasPassword ? (
            <div>
              <label htmlFor={`confirm-${user.id}`} className={fieldLabel}>
                Your password
              </label>
              <input
                ref={firstRef}
                id={`confirm-${user.id}`}
                type="password"
                autoComplete="current-password"
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {needsSignIn ? (
          <button ref={firstRef} type="button" onClick={() => signOut({ callbackUrl: "/signin?callbackUrl=%2Fadmin" })} className={primary}>
            Sign in again
          </button>
        ) : (
          <button
            ref={hasPassword || kind === "delete" ? undefined : firstRef}
            type="submit"
            disabled={saving || !ready}
            aria-busy={saving}
            className={kind === "delete" || kind === "deactivate" ? primary.replace("bg-ink-900", "bg-red-700").replace("hover:bg-ink-800", "hover:bg-red-800") : primary}
          >
            {saving ? action.busy : action.submit}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={saving} className={secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
