// Renders the tailnet URL as an SVG QR code for the Cockpit panel, so the iPhone can open it by camera.
// The URL carries the access token, so it arrives on stdin, never in argv (visible to `ps`).
//   usage: echo "$url" | node src/qr.ts

import qrcode from 'qrcode-generator';

export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

if (import.meta.main) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => {
    const url = input.trim();
    if (!url) {
      console.error('qr: no URL on stdin');
      process.exit(1);
    }
    console.log(qrSvg(url));
  });
}
