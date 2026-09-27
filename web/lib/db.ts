import { MongoClient, type Db } from "mongodb";

// One client per server process. In dev, hot reloads re-run this file, so the
// client is kept on globalThis to avoid opening a new connection on every edit.
const globalForMongo = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (web/.env.local or Vercel env vars).");
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(uri).connect();
  }
  return globalForMongo.mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || "kin");
}

// Every read strips Mongo's internal _id and our seeded flag, so responses
// match contract/CONTRACT.md shapes exactly.
export const clean = { projection: { _id: 0, seeded: 0 } } as const;
