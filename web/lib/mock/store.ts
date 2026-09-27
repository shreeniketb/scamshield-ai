import type { MockStoreData } from "./seed";
import { createSeedStore } from "./seed";
import { publishBus } from "./bus";
import type { CircleSettings, Payment, VerifyRequest } from "../types";

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

export function updatePayment(id: string, changes: Partial<Payment>): Payment | null {
  let updated: Payment | null = null;
  memory.payments = memory.payments.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...changes };
    return updated;
  });
  save();
  publishBus({ type: "store_updated" });
  return updated;
}

export function updateSettings(changes: Partial<CircleSettings>): CircleSettings {
  memory.settings = { ...memory.settings, ...changes };
  memory.circle = {
    ...memory.circle,
    members: memory.settings.members,
    safe_word_set: memory.settings.safe_word_set,
  };
  save();
  publishBus({ type: "store_updated" });
  return memory.settings;
}

export function resetStore() {
  memory = createSeedStore();
  save();
  publishBus({ type: "store_updated" });
}
