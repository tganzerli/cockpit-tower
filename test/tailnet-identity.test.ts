import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tailnetIdentity } from '../src/tailnet-identity.ts';

const status = (self: object, users: object = { '42': { LoginName: 'me@example.com' } }) => JSON.stringify({ Self: self, User: users });

test('origin and owner come from Self and its user', () => {
  assert.deepEqual(tailnetIdentity(status({ DNSName: 'mac.tail.ts.net.', UserID: 42 }), '8443'), {
    origin: 'https://mac.tail.ts.net:8443',
    owner: 'me@example.com',
  });
});

test('port 443 is left out of the origin, as browsers send it', () => {
  assert.equal(tailnetIdentity(status({ DNSName: 'mac.tail.ts.net.', UserID: 42 }), '443').origin, 'https://mac.tail.ts.net');
});

test('missing or unreadable data yields nulls instead of a guess', () => {
  assert.deepEqual(tailnetIdentity('', '8443'), { origin: null, owner: null });
  assert.deepEqual(tailnetIdentity('not json', '8443'), { origin: null, owner: null });
  assert.deepEqual(tailnetIdentity(status({ UserID: 7 }), '8443'), { origin: null, owner: null });
  assert.equal(tailnetIdentity(status({ DNSName: 'mac.tail.ts.net.' }), '8443').owner, null);
  assert.equal(tailnetIdentity(status({ DNSName: 'mac.tail.ts.net.', UserID: 42 }), 'x').origin, null);
});
