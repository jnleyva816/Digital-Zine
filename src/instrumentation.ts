/**
 * Runs once when the Next.js server starts. It starts the media worker in this process (DIG-26)
 * unless MEDIA_WORKER=off, for example on a web-only instance once a separate worker exists.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MEDIA_WORKER === "off") return;
  const { startMediaWorker } = await import("./lib/media/queue");
  try {
    await startMediaWorker();
  } catch (error) {
    // Uploads still save; they wait as "processing" until a worker runs.
    console.error("Media worker did not start", error);
  }
}
