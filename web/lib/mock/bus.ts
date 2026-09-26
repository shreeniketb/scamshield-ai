import type { BusMessage } from "../types";

const CHANNEL = "scamshield";

export function publishBus(message: BusMessage) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(message);
  channel.close();
}

export function subscribeBus(onMessage: (message: BusMessage) => void) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(CHANNEL);
  const handler = (event: MessageEvent<BusMessage>) => onMessage(event.data);
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}
