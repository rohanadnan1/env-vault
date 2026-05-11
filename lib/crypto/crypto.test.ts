import test from 'node:test';
import assert from 'node:assert';
import { deriveVaultKey } from './vault';
import { encryptSecret } from './encrypt';
import { decryptSecret, DecryptionError } from './decrypt';
import { encryptShareBundle, decryptShareBundle } from './share';
import {
    decryptSpaceKey,
    encryptSpaceKeyForMember,
    generateSpaceKey,
} from './private-space';

test('crypto round-trip encryption/decryption', async () => {
    const key = await deriveVaultKey('my_master_password', 'c29tZXNhbHQ=', 100); 
    
    const plaintext = 'super_secret_value';
    const aad = 'MY_KEY:env_123';
    
    const { valueEncrypted, iv } = await encryptSecret(plaintext, key, aad);
    
    assert.notStrictEqual(valueEncrypted, plaintext);
    assert.strictEqual(typeof iv, 'string');
    
    const decrypted = await decryptSecret(valueEncrypted, iv, key, aad);
    assert.strictEqual(decrypted, plaintext);
});

test('crypto wrong key decryption fails', async () => {
    const key1 = await deriveVaultKey('pwd1', 'c29tZXNhbHQ=', 100);
    const key2 = await deriveVaultKey('pwd2', 'c29tZXNhbHQ=', 100);
    
    const { valueEncrypted, iv } = await encryptSecret('secret', key1);
    
    await assert.rejects(
        () => decryptSecret(valueEncrypted, iv, key2),
        DecryptionError
    );
});

test('crypto wrong AAD decryption fails', async () => {
    const key = await deriveVaultKey('pwd', 'c29tZXNhbHQ=', 100);
    const { valueEncrypted, iv } = await encryptSecret('secret', key, 'correctData');
    
    await assert.rejects(
        () => decryptSecret(valueEncrypted, iv, key, 'wrongData'),
        DecryptionError
    );
});

test('crypto share bundle encryption/decryption', async () => {
   const shareKey = await deriveVaultKey('sharepwd', 'c29tZXNhbHQ=', 100);
   const payload = JSON.stringify([{ keyName: 'API_KEY', value: '12345' }]);
   
   const { bundleEncrypted, bundleIv } = await encryptShareBundle(payload, shareKey, 'token-123');
   
   const decrypted = JSON.parse(await decryptShareBundle(bundleEncrypted, bundleIv, shareKey, 'token-123'));
   assert.strictEqual(decrypted[0].keyName, 'API_KEY');
   assert.strictEqual(decrypted[0].value, '12345');
});

test('crypto IV is never reused', async () => {
    const key = await deriveVaultKey('pwd', 'c29tZXNhbHQ=', 100);
    const { iv: iv1 } = await encryptSecret('secret', key);
    const { iv: iv2 } = await encryptSecret('secret', key);
    
    assert.notStrictEqual(iv1, iv2);
});

test('private space key can be wrapped for a member and unwrapped again', async () => {
    const memberKeyPair = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    );

    const spaceKey = await generateSpaceKey();
    const encryptedSpaceKey = await encryptSpaceKeyForMember(spaceKey, memberKeyPair.publicKey);
    const unwrappedSpaceKey = await decryptSpaceKey(encryptedSpaceKey, memberKeyPair.privateKey);

    const plaintext = 'the-iron-throne';
    const { valueEncrypted, iv } = await encryptSecret(plaintext, unwrappedSpaceKey);
    const decrypted = await decryptSecret(valueEncrypted, iv, spaceKey);

    assert.strictEqual(decrypted, plaintext);
});

test('unwrapped private space key can be re-wrapped for another member', async () => {
    const firstMember = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    );

    const secondMember = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    );

    const originalSpaceKey = await generateSpaceKey();
    const wrappedForFirstMember = await encryptSpaceKeyForMember(originalSpaceKey, firstMember.publicKey);
    const unwrappedByFirstMember = await decryptSpaceKey(wrappedForFirstMember, firstMember.privateKey);
    const wrappedForSecondMember = await encryptSpaceKeyForMember(unwrappedByFirstMember, secondMember.publicKey);
    const unwrappedBySecondMember = await decryptSpaceKey(wrappedForSecondMember, secondMember.privateKey);

    const plaintext = 'invite-roundtrip';
    const { valueEncrypted, iv } = await encryptSecret(plaintext, unwrappedBySecondMember);
    const decrypted = await decryptSecret(valueEncrypted, iv, originalSpaceKey);

    assert.strictEqual(decrypted, plaintext);
});
