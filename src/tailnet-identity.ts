// From `tailscale status --json`: the origin the page is served from, and the login of this Mac's owner,
// the only one allowed to type (ADR 2026-10-23_phone-input-client).
//   usage: tailscale status --json | node src/tailnet-identity.ts <https-port>   → origin, then owner (empty line if unknown)

interface TailscaleStatus {
  Self?: { DNSName?: unknown; UserID?: unknown };
  User?: Record<string, { LoginName?: unknown }>;
}

export function tailnetIdentity(json: string, httpsPort: string): { origin: string | null; owner: string | null } {
  let status: TailscaleStatus;
  try {
    status = JSON.parse(json || '{}') as TailscaleStatus;
  } catch {
    return { origin: null, owner: null };
  }
  const name = typeof status.Self?.DNSName === 'string' ? status.Self.DNSName.replace(/\.$/, '') : '';
  let origin: string | null = null;
  try {
    // URL drops a default :443, exactly as a browser's Origin header does.
    if (name && /^\d+$/.test(httpsPort)) origin = new URL(`https://${name}:${httpsPort}`).origin;
  } catch {
    origin = null;
  }
  const userId = status.Self?.UserID;
  const login = userId !== undefined && userId !== null ? status.User?.[String(userId)]?.LoginName : undefined;
  return { origin, owner: typeof login === 'string' && login !== '' ? login : null };
}

if (import.meta.main) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => {
    const { origin, owner } = tailnetIdentity(input, process.argv[2] ?? '');
    process.stdout.write(`${origin ?? ''}\n${owner ?? ''}\n`);
  });
}
