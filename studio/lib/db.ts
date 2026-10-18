// Pure-JS, zero-native-dependency store. Data is kept in memory and persisted
// to a JSON file under DATA_DIR. No compiled modules, so it runs identically on
// any host (local, Render, etc.). Persistence is best-effort; on read-only or
// ephemeral filesystems the app still works (in-memory for the process life).

import fs from "node:fs";
import path from "node:path";

export interface Data {
  users: any[];
  sessions: any[];
  projects: any[];
  assets: any[];
  jobs: any[];
  creditTxns: any[];
}

const EMPTY: Data = { users: [], sessions: [], projects: [], assets: [], jobs: [], creditTxns: [] };

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "db.json");

function load(): Data {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return structuredClone(EMPTY);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __studioData: Data | undefined;
}

export const data: Data = global.__studioData ?? load();
global.__studioData = data;

export function save(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {
    // Read-only/ephemeral filesystem: keep working in memory.
  }
}
