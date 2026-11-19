import { PgBoss } from "pg-boss";
import { processAsset } from "./process";

/** pg-boss queue for turning uploads into AVIF copies (DIG-26). It keeps its tables in `pgboss`. */
export const PROCESS_QUEUE = "media-process";

type Globals = { mediaBoss?: Promise<PgBoss> };
const globals = globalThis as typeof globalThis & Globals;

/** pg reads unknown URL options as client settings; Prisma's `?schema=` is not one of them. */
function connectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

/** One started pg-boss per server process, shared by the API routes and the worker. */
function getBoss(): Promise<PgBoss> {
  globals.mediaBoss ??= (async () => {
    const boss = new PgBoss({ connectionString: connectionString(), schema: "pgboss" });
    boss.on("error", (error) => console.error("Media queue error", error));
    await boss.start();
    await boss.createQueue(PROCESS_QUEUE);
    return boss;
  })().catch((error: unknown) => {
    globals.mediaBoss = undefined;
    throw error;
  });
  return globals.mediaBoss;
}

export async function enqueueProcessing(assetId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(PROCESS_QUEUE, { assetId }, { singletonKey: assetId });
}

/**
 * Starts the worker in this process. One photo at a time: decoding a 40MP photo takes a few
 * hundred MB, and an encode takes several seconds of CPU.
 */
export async function startMediaWorker(): Promise<void> {
  const boss = await getBoss();
  await boss.work<{ assetId: string }>(PROCESS_QUEUE, { batchSize: 1, localConcurrency: 1 }, async ([job]) => {
    if (job) await processAsset(job.data.assetId);
  });
}
