// Builds the machine-readable `tower status --json` from values bin/tower already collected.
// The URL carries the access token, so it arrives on stdin, never in argv (visible to `ps`).
//   usage: echo "$url" | node src/status-json.ts <gateway-pid> <caffeinate-pid> <published 0|1> <port> <https-port> <socket 0|1> <socket-path>

export interface TowerStatus {
  on: boolean;
  gateway: { running: boolean; pid: number | null; port: number };
  awake: { running: boolean; pid: number | null };
  tailnet: { published: boolean; port: number; url: string | null };
  cockpit: { socket: boolean; path: string };
}

const pidOf = (s: string | undefined): number | null => (/^\d+$/.test(s ?? '') ? Number(s) : null);

export function buildStatus(args: string[], url: string): TowerStatus {
  const [gatewayPid, caffeinatePid, published, port, httpsPort, socket, socketPath] = args;
  const gw = pidOf(gatewayPid);
  const aw = pidOf(caffeinatePid);
  const pub = published === '1';
  const link = url.trim();
  return {
    on: gw !== null && pub,
    gateway: { running: gw !== null, pid: gw, port: Number(port) },
    awake: { running: aw !== null, pid: aw },
    tailnet: { published: pub, port: Number(httpsPort), url: pub && link.startsWith('https://') ? link : null },
    cockpit: { socket: socket === '1', path: socketPath ?? '' },
  };
}

if (import.meta.main) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => console.log(JSON.stringify(buildStatus(process.argv.slice(2), input))));
}
