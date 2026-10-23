import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrSvg } from '../src/qr.ts';

const URL = 'https://mac.tail.ts.net:8443/s3cr3t-token/';

test('renders an SVG', () => {
  const svg = qrSvg(URL);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
});

test('the URL and its token never appear as plain text in the SVG', () => {
  const svg = qrSvg(URL);
  assert.equal(svg.includes('s3cr3t-token'), false);
  assert.equal(svg.includes('tail.ts.net'), false);
});
