import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyQaMfa(api) {
  const enrolled = await api.auth.mfa.enroll({ factorType: 'totp' });
  assert.ifError(enrolled.error);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of enrolled.data.totp.secret.replace(/=/g, '')) bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const code = ((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
  assert.ifError((await api.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code })).error);
}
