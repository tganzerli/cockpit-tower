// Decides from `tailscale serve status --json` whether a tailnet port is published AND proxies to
// this gateway. Text output omits `:443` and can be cut short by SIGPIPE, so bin/tower uses this instead.
//   usage: tailscale serve status --json | node src/serve-status.ts <https-port> <proxy-target>

interface ServeConfig {
  TCP?: Record<string, unknown>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
}

export function isPublished(json: string, httpsPort: string, target: string): boolean {
  let cfg: ServeConfig;
  try {
    cfg = JSON.parse(json || '{}') as ServeConfig;
  } catch {
    return false;
  }
  if (!cfg.TCP?.[httpsPort]) return false;
  const web = Object.entries(cfg.Web ?? {}).find(([host]) => host.endsWith(`:${httpsPort}`));
  const proxies = Object.values(web?.[1].Handlers ?? {}).map((h) => h.Proxy);
  return proxies.includes(target);
}

if (import.meta.main) {
  const [httpsPort, target] = process.argv.slice(2);
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => process.exit(isPublished(input, httpsPort ?? '', target ?? '') ? 0 : 1));
}
