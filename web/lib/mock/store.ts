import type { MockStoreData } from "./seed";
import { createSeedStore } from "./seed";
import { publishBus } from "./bus";
import type { VerifyRequest } from "../types";

const STORAGE_KEY = "scamshield-mock-v1";

let memory = createSeedStore();

function loadFromStorage() {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as Partial<MockStoreData>;
    memory = {
      ...createSeedStore(),
      ...saved,
      verifies: saved.verifies ?? memory.verifies,
      payments: saved.payments ?? memory.payments,
    };
  } catch {
    memory = createSeedStore();
  }
}

function save() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        verifies: memory.verifies,
        payments: memory.payments,
        circle: memory.circle,
        settings: memory.settings,
      }),
    );
  } catch {
    // Quota or private-mode — in-memory store and the bus still work.
  }
}

if (typeof window !== "undefined") {
  loadFromStorage();
}

export function getStore(): MockStoreData {
  if (typeof window !== "undefined") loadFromStorage();
  return memory;
}

export function setPendingVerify(verify: VerifyRequest) {
  memory.verifies = [verify, ...memory.verifies.filter((item) => item.id !== verify.id)];
  save();
  publishBus({ type: "verify_pending", verify });
}

export function updateVerify(verify: VerifyRequest) {
  memory.verifies = memory.verifies.map((item) => (item.id === verify.id ? verify : item));
  save();
  publishBus({ type: "verify_updated", verify });
}

export function expireOldVerifies(now = Date.now()) {
  let changed = false;
  memory.verifies = memory.verifies.map((item) => {
    if (item.status !== "pending") return item;
    if (Date.parse(item.expires_at) > now) return item;
    changed = true;
    return { ...item, status: "expired" as const };
  });
  if (changed) save();
}

export function resetStore() {
  memory = createSeedStore();
  save();
  publishBus({ type: "store_updated" });
}
