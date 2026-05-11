"use client";

import {
  decryptSpaceKey,
  encryptSpaceKeyForMember,
  generateSpaceKey,
  importMemberPrivateKey,
} from '@/lib/crypto/private-space';
import { fromBase64, toBase64 } from '@/lib/crypto/utils';

const STORAGE_PREFIX = 'envvault:private-space-keypair:';
const DEFAULT_ALGORITHM = 'RSA-OAEP-256';

export type PrivateSpaceKeyPairRecord = {
  publicKey: string;
  privateKey: string;
  algorithm: string;
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function exportBufferToBase64(buffer: ArrayBuffer) {
  return toBase64(new Uint8Array(buffer));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generatePrivateSpaceKeyPair(): Promise<PrivateSpaceKeyPairRecord> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ]);

  return {
    publicKey: exportBufferToBase64(publicKey),
    privateKey: exportBufferToBase64(privateKey),
    algorithm: DEFAULT_ALGORITHM,
  };
}

export function readPrivateSpaceKeyPair(userId: string): PrivateSpaceKeyPairRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PrivateSpaceKeyPairRecord;
    if (!parsed.publicKey || !parsed.privateKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePrivateSpaceKeyPair(userId: string, record: PrivateSpaceKeyPairRecord) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(record));
}

export async function ensurePrivateSpaceKeyPair(userId: string) {
  const existing = readPrivateSpaceKeyPair(userId);
  if (existing) return existing;

  const generated = await generatePrivateSpaceKeyPair();
  savePrivateSpaceKeyPair(userId, generated);
  return generated;
}

export async function decryptSpaceKeyForCurrentUser(encryptedSpaceKey: string, userId: string) {
  const record = readPrivateSpaceKeyPair(userId);
  if (!record) {
    throw new Error('Missing local private space keypair');
  }

  const privateKey = await importMemberPrivateKey(record.privateKey);
  return decryptSpaceKey(encryptedSpaceKey, privateKey);
}

export async function createEncryptedSpaceKeyForCurrentUser(userId: string) {
  const record = await ensurePrivateSpaceKeyPair(userId);
  const spaceKey = await generateSpaceKey();
  const encryptedSpaceKey = await encryptSpaceKeyForMember(spaceKey, record.publicKey);

  return {
    record,
    spaceKey,
    encryptedSpaceKey,
    encryptedSpaceKeyAlgorithm: record.algorithm,
  };
}

export async function exportSpaceKeyRaw(spaceKey: CryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', spaceKey);
  return exportBufferToBase64(raw);
}

export async function importSpaceKeyRaw(spaceKeyBase64: string) {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(fromBase64(spaceKeyBase64)),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
