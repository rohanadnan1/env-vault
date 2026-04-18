/**
 * Biometric Unlock with WebAuthn PRF Extension
 * Allows deriving a local encryption key from Touch ID / Face ID
 */

const CRED_ID_KEY = 'envault_bio_cred_id';
const PAYLOAD_KEY = 'envault_bio_payload';
const IV_KEY = 'envault_bio_iv';
// Constant salt for PRF - domain separated by WebAuthn spec
const PRF_SALT = new Uint8Array(32).fill(7); 

interface WebAuthnPRFExtension {
  prf?: {
    eval?: {
      first: Uint8Array;
      second?: Uint8Array;
    };
    results?: {
      first: ArrayBuffer;
      second?: ArrayBuffer;
    };
  };
}

export async function isBiometricSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential || 
      !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
    return false;
  }
  
  const isPlatformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!isPlatformAvailable) return false;

  // Modern way to check for PRF
  if (PublicKeyCredential.getClientCapabilities) {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    if (capabilities['extension:prf'] === true) return true;
  }

  // Fallback check for older/alternate PRF/hmac-secret support
  // Some browsers support it but don't explicitly list it in capabilities yet
  return true; // We will attempt and catch errors during enrollment/scan
}

export function isBiometricEnrolled(): boolean {
  return !!localStorage.getItem(CRED_ID_KEY);
}

/**
 * Registers a new biometric credential and stores the encrypted master password
 */
export async function enrollBiometrics(masterPassword: string): Promise<void> {
  const user = {
    id: crypto.getRandomValues(new Uint8Array(16)),
    name: 'Vault User',
    displayName: 'Vault User',
  };

  const options: PublicKeyCredentialCreationOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'EnVault', id: window.location.hostname },
    user: {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
    timeout: 60000,
    extensions: {
      prf: { eval: { first: PRF_SALT } }
    } as any
  };

  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential;

  if (!credential) throw new Error('Failed to create biometric credential');

  const extensionResults = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & WebAuthnPRFExtension;
  const prfResult = extensionResults.prf?.results?.first;
  
  if (!prfResult) {
    throw new Error('Biometric hardware does not support key derivation (PRF)');
  }

  // Derive an encryption key from the PRF output
  const encryptionKey = await deriveKeyFromPrf(prfResult);

  // Encrypt the master password
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPw = new TextEncoder().encode(masterPassword);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encodedPw
  );

  // Store locally
  localStorage.setItem(CRED_ID_KEY, btoa(String.fromCharCode(...new Uint8Array(credential.rawId))));
  localStorage.setItem(PAYLOAD_KEY, btoa(String.fromCharCode(...new Uint8Array(ciphertext))));
  localStorage.setItem(IV_KEY, btoa(String.fromCharCode(...new Uint8Array(iv))));
}

/**
 * Unlocks the stored password using a biometric scan
 */
export async function unlockWithBiometrics(): Promise<string> {
  const credIdB64 = localStorage.getItem(CRED_ID_KEY);
  const payloadB64 = localStorage.getItem(PAYLOAD_KEY);
  const ivB64 = localStorage.getItem(IV_KEY);

  if (!credIdB64 || !payloadB64 || !ivB64) {
    throw new Error('Biometrics not enrolled');
  }

  const credId = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payloadB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

  const options: PublicKeyCredentialRequestOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: window.location.hostname,
    allowCredentials: [{
      id: credId,
      type: 'public-key',
    }],
    userVerification: 'required',
    extensions: {
      prf: { eval: { first: PRF_SALT } }
    } as any
  };

  const assertion = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential;

  if (!assertion) throw new Error('Biometric scan failed');

  const extensionResults = assertion.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & WebAuthnPRFExtension;
  const prfResult = extensionResults.prf?.results?.first;

  if (!prfResult) throw new Error('Failed to derive biometric key');

  const decryptionKey = await deriveKeyFromPrf(prfResult);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    decryptionKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export function clearBiometricEnrollment() {
  localStorage.removeItem(CRED_ID_KEY);
  localStorage.removeItem(PAYLOAD_KEY);
  localStorage.removeItem(IV_KEY);
}

async function deriveKeyFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(0),
      hash: 'SHA-256',
      info: new TextEncoder().encode('envault-biometric-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
