import { ACCOUNT_STORAGE_BYTES, formatBytes } from "@/lib/limits";

/** How much of the account's 2 GB is used, across all boards (DIG-32, DIG-25). Warns from 90%. */
export function StorageMeter({ usedBytes }: { usedBytes: number }) {
  const used = Math.min(Math.max(usedBytes, 0), ACCOUNT_STORAGE_BYTES);
  const ratio = used / ACCOUNT_STORAGE_BYTES;
  const label = `${formatBytes(used)} of ${formatBytes(ACCOUNT_STORAGE_BYTES)} used`;
  const full = used >= ACCOUNT_STORAGE_BYTES;
  const warn = !full && ratio >= 0.9;

  return (
    <div className="mt-3 max-w-sm">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-mono uppercase tracking-wider text-ink-700">Storage</span>
        <span className="text-ink-500">{label}</span>
      </div>
      <div
        role="meter"
        aria-label="Storage"
        aria-valuemin={0}
        aria-valuemax={ACCOUNT_STORAGE_BYTES}
        aria-valuenow={used}
        aria-valuetext={label}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-200"
      >
        <div
          className={`h-full rounded-full ${full ? "bg-red-600" : warn ? "bg-amber-500" : "bg-ink-900"}`}
          style={{ width: `${Math.round(ratio * 1000) / 10}%` }}
        />
      </div>
      {full ? (
        <p className="mt-1.5 text-xs text-red-800">Your storage is full. Delete photos to upload more.</p>
      ) : warn ? (
        <p className="mt-1.5 text-xs text-amber-800">Almost full. Delete photos to make room.</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-500">Shared by all your boards.</p>
      )}
    </div>
  );
}
