import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyBearerToken } from '../dist/services/auth.js';

describe('verifyBearerToken (dev mode)', () => {
  it('returns dev-user when no authorization header', async () => {
    const user = await verifyBearerToken(undefined);
    assert.strictEqual(user.uid, 'dev-user');
    assert.ok(user.email);
    assert.ok(user.name);
  });

  it('returns dev-user for empty string header', async () => {
    const user = await verifyBearerToken('');
    assert.strictEqual(user.uid, 'dev-user');
  });

  it('extracts uid from plain Bearer token', async () => {
    const user = await verifyBearerToken('Bearer my-custom-uid');
    assert.strictEqual(user.uid, 'my-custom-uid');
  });

  it('decodes JWT payload with user_id', async () => {
    const payload = Buffer.from(JSON.stringify({
      user_id: 'jwt-uid-123',
      email: 'jwt@example.com',
      name: 'JWT User',
      picture: 'https://example.com/photo.jpg'
    })).toString('base64url');
    const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.fakesig`;

    const user = await verifyBearerToken(`Bearer ${fakeJwt}`);
    assert.strictEqual(user.uid, 'jwt-uid-123');
    assert.strictEqual(user.email, 'jwt@example.com');
    assert.strictEqual(user.name, 'JWT User');
    assert.strictEqual(user.picture, 'https://example.com/photo.jpg');
  });

  it('falls back to sub claim when user_id is absent', async () => {
    const payload = Buffer.from(JSON.stringify({
      sub: 'sub-uid-456',
      email: 'sub@example.com'
    })).toString('base64url');
    const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.fakesig`;

    const user = await verifyBearerToken(`Bearer ${fakeJwt}`);
    assert.strictEqual(user.uid, 'sub-uid-456');
    assert.strictEqual(user.email, 'sub@example.com');
  });

  it('falls back to raw token when JWT decode fails', async () => {
    const user = await verifyBearerToken('Bearer not-a-jwt');
    assert.strictEqual(user.uid, 'not-a-jwt');
  });

  it('provides default email and name for non-JWT tokens', async () => {
    const user = await verifyBearerToken('Bearer simple-token');
    assert.match(user.email, /@dev\.local$/);
    assert.strictEqual(user.name, 'Dev User');
  });
});
