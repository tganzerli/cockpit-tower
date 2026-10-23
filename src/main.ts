import os from 'node:os';
import path from 'node:path';
import { openInputLog } from './input-log.ts';
import type { InputLog } from './input-log.ts';
import { startTowerServer } from './server.ts';
import { createSessionInfo } from './session-info.ts';

const dev = process.argv.includes('--dev');
const port = Number(process.env.TOWER_PORT ?? 7681);
const socketPath = process.env.TOWER_SOCKET ?? path.join(os.homedir(), '.cockpit', 'cockpit-server.sock');
const token = process.env.TOWER_TOKEN || undefined;
const cockpitBin = process.env.TOWER_COCKPIT_BIN ?? path.join(os.homedir(), '.cockpit', 'bin', 'cockpit');
if (!dev && !token) {
  console.error('cockpit-tower: TOWER_TOKEN is required (bin/tower generates one); use --dev for local testing');
  process.exit(2);
}

// Typing needs all three (ADR 2026-10-23_phone-input-client); without them the page stays read-only.
const origin = process.env.TOWER_ORIGIN || undefined;
const owner = process.env.TOWER_OWNER || undefined;
const inputLogPath = process.env.TOWER_INPUT_LOG || undefined;
let input: { owner: string | null; log: InputLog } | undefined;
if (inputLogPath && (dev || (origin && owner))) {
  try {
    input = { owner: owner ?? null, log: openInputLog(inputLogPath) };
  } catch (err) {
    console.warn(`cockpit-tower: input log unavailable (${(err as Error).message})`);
  }
}
if (!input) console.warn('cockpit-tower: typing disabled (needs TOWER_INPUT_LOG, TOWER_ORIGIN and TOWER_OWNER); the page is read-only');

const sessionInfo = createSessionInfo({ cockpitBin });
const server = await startTowerServer({
  socketPath,
  port,
  dev,
  sessionInfo,
  ...(token ? { token } : {}),
  ...(origin ? { origin } : {}),
  ...(input ? { input } : {}),
});
const { address, port: boundPort } = server.address();
console.log(`cockpit-tower listening on http://${address}:${boundPort}/${token ? '<token>/' : ''}${dev ? ' (dev: tailscale check off)' : ''}`);
console.log(`cockpit socket: ${socketPath}`);

const stop = async () => {
  // A close that hangs (a stuck viewer socket) must not keep the process, and caffeinate, alive.
  setTimeout(() => process.exit(1), 3000).unref();
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
