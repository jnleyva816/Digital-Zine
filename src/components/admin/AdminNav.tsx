import Link from "next/link";
import { focusRing } from "./styles";

const SECTIONS = [
  { key: "users", href: "/admin", label: "Users" },
  { key: "zines", href: "/admin/zines", label: "Zines" },
  { key: "subscriptions", href: "/admin/subscriptions", label: "Subscriptions" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["key"];

/** The admin panel's sections (DIG-138, DIG-139). */
export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav aria-label="Admin" className="mt-4 flex gap-1 overflow-x-auto border-b border-paper-300">
      {SECTIONS.map(({ key, href, label }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className={`-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm ${focusRing} ${
            key === current ? "border-ink-900 font-semibold text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
