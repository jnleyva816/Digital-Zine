import { startMediaWorker } from "./lib/media/queue";

// MEDIA_WORKER=off runs the web server without the worker, for example once a separate worker exists.
if (process.env.MEDIA_WORKER !== "off") {
  try {
    await startMediaWorker();
  } catch (error) {
    // Uploads still save; they wait as "processing" until a worker runs.
    console.error("Media worker did not start", error);
  }
}
