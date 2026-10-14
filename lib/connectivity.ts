// navigator.onLine only reflects whether the device has a live network
// interface — it does not confirm the server is actually reachable, and it
// is known to flip to false on Wi-Fi blips, VPNs, captive portals, and
// sleep/wake cycles even when the internet works fine. This module verifies
// real reachability with a lightweight ping and keeps a shared, debounced
// status that every "online/offline" UI in the app reads from.

const PING_URL = "/api/ping";
const PING_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 20000;

let verifiedOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<(online: boolean) => void>();

async function pingServer(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(PING_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function setVerifiedOnline(online: boolean) {
  if (online === verifiedOnline) return;
  verifiedOnline = online;
  listeners.forEach((cb) => cb(online));
}

export async function verifyConnectivityNow(): Promise<boolean> {
  // A dead network interface really does mean offline — skip the round trip.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setVerifiedOnline(false);
    return false;
  }

  if (!inFlight) {
    inFlight = pingServer().finally(() => {
      inFlight = null;
    });
  }

  const reachable = await inFlight;
  setVerifiedOnline(reachable);
  return reachable;
}

export function ensureConnectivityMonitor() {
  if (pollTimer || typeof window === "undefined") return;

  pollTimer = setInterval(() => {
    verifyConnectivityNow();
  }, POLL_INTERVAL_MS);

  window.addEventListener("online", () => verifyConnectivityNow());
  window.addEventListener("offline", () => verifyConnectivityNow());

  verifyConnectivityNow();
}

export function getConnectivity(): boolean {
  return verifiedOnline;
}

export function subscribeConnectivity(cb: (online: boolean) => void): () => void {
  ensureConnectivityMonitor();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
