// Database wiring will live here once we pick the ORM/driver.
// For now this file anchors a single import path for DB access.
export type DbClient = unknown;

export function getDb(): DbClient {
  throw new Error("DB not initialized yet. Choose ORM/driver and wire it here.");
}
