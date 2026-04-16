import test from 'node:test';
import assert from 'node:assert';
import { deriveVaultKey } from './vault';
import { encryptSecret } from './encrypt';
import { decryptSecret, DecryptionError } from './decrypt';
import { encryptShareBundle, decryptShareBundle } from './share';

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
   const payload = [{ keyName: 'API_KEY', plaintext: '12345' }];
   
   const { bundleEncrypted, bundleIv } = await encryptShareBundle(payload, shareKey);
   
   const decrypted = await decryptShareBundle(bundleEncrypted, bundleIv, shareKey);
   assert.strictEqual(decrypted[0].keyName, 'API_KEY');
   assert.strictEqual(decrypted[0].value, '12345');
});

test('crypto IV is never reused', async () => {
    const key = await deriveVaultKey('pwd', 'c29tZXNhbHQ=', 100);
    const { iv: iv1 } = await encryptSecret('secret', key);
    const { iv: iv2 } = await encryptSecret('secret', key);
    
    assert.notStrictEqual(iv1, iv2);
});
