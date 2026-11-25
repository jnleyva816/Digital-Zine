"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import type { AdminUser, AdminUserPage } from "@/lib/admin-users";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500";
const primary = `min-h-11 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-sm hover:bg-ink-800 disabled:opacity-50 ${focusRing}`;
const secondary = `min-h-11 rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 shadow-sm hover:bg-paper-100 disabled:opacity-50 ${focusRing}`;
const badge = "rounded-full border border-paper-300 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-700";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
// A fixed time zone, so the server and the browser write the same day.
const joined = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

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
  const [openId, setOpenId] = useState<string | null>(null);

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
      if (kind === "search") setOpenId(null);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  function changed(user: AdminUser, role: AdminUser["role"]) {
    setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, role } : u)));
    setNotice(role === "admin" ? `${user.email} is now an admin.` : `${user.email} is no longer an admin.`);
    setOpenId(null);
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

      <p role="status" className={notice ? "mt-3 break-words text-sm text-ink-700" : "sr-only"}>
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
              open={openId === user.id}
              onOpen={() => {
                setNotice("");
                setOpenId(user.id);
              }}
              onClose={() => setOpenId(null)}
              onChanged={(role) => changed(user, role)}
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

interface UserRowProps {
  user: AdminUser;
  self: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChanged: (role: AdminUser["role"]) => void;
  hasPassword: boolean;
  recentSignIn: boolean;
}

function UserRow({ user, self, open, onOpen, onClose, onChanged, hasPassword, recentSignIn }: UserRowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // The button comes back when the form closes; so does focus.
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const isAdmin = user.role === "admin";
  const canChange = !self && (isAdmin || user.verified);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          {user.name ? <p className="break-words text-sm font-semibold text-ink-900">{user.name}</p> : null}
          <p className="break-all text-sm text-ink-700">{user.email}</p>
          <p className="mt-1 text-xs text-ink-500">
            Joined {joined.format(new Date(user.createdAt))} · {user.zineCount} {user.zineCount === 1 ? "zine" : "zines"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {self ? <span className={badge}>You</span> : null}
            {isAdmin ? <span className={badge}>Admin</span> : null}
            <span className={badge}>{user.tier === "pro" ? "Pro" : "Free"}</span>
            {user.verified ? null : <span className={badge}>Email not verified</span>}
          </div>
        </div>
        {canChange && !open ? (
          <button
            ref={buttonRef}
            type="button"
            onClick={onOpen}
            aria-label={isAdmin ? `Remove admin role from ${user.email}` : `Make ${user.email} an admin`}
            className={secondary}
          >
            {isAdmin ? "Remove admin role…" : "Make admin…"}
          </button>
        ) : null}
      </div>
      {open ? <RoleForm user={user} onClose={onClose} onChanged={onChanged} hasPassword={hasPassword} recentSignIn={recentSignIn} /> : null}
    </li>
  );
}

function RoleForm({ user, onClose, onChanged, hasPassword, recentSignIn }: Pick<UserRowProps, "user" | "onClose" | "onChanged" | "hasPassword" | "recentSignIn">) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(!hasPassword && !recentSignIn);
  const firstRef = useRef<HTMLInputElement & HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), [needsSignIn]);

  const grant = user.role !== "admin";
  const role = grant ? "admin" : "user";
  const passwordId = `confirm-${user.id}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasPassword ? { role, password } : { role }),
      });
      if (res.ok) return onChanged(role);
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (body?.code === "reauth_required" && !hasPassword) setNeedsSignIn(true);
      else setError(body?.error ?? "The role could not be changed. Try again in a moment.");
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={`Change the role of ${user.email}`} className="mt-4 space-y-3 rounded-xl border border-paper-300 bg-paper-100 p-4">
      <p className="text-sm text-ink-700">
        {grant
          ? "Admins can see every user and change who is an admin, and get Pro features without paying."
          : "They keep their account and zines, and lose the admin panel and free Pro features at once."}
      </p>
      {needsSignIn ? (
        <p className="text-sm text-ink-700">For security, sign in once more, then come back here within five minutes.</p>
      ) : hasPassword ? (
        <div>
          <label htmlFor={passwordId} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
            Your password
          </label>
          <input
            ref={firstRef}
            id={passwordId}
            type="password"
            autoComplete="current-password"
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20 sm:max-w-sm"
          />
        </div>
      ) : null}
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
          <button ref={hasPassword ? undefined : firstRef} type="submit" disabled={saving || (hasPassword && !password)} aria-busy={saving} className={primary}>
            {saving ? "Saving…" : grant ? "Make admin" : "Remove admin role"}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={saving} className={secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
