import { stateStats } from "@/lib/mock/community";
import { json } from "@/lib/server/http";

// Placeholder IC3 figures until Raj provides the real 2025 numbers.
export async function GET() {
  return json(stateStats);
}
