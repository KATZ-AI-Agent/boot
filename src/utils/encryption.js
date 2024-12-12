import CryptoJS from 'crypto-js';
import { config } from '../core/config.js';
import { ErrorTypes } from '../core/errors/ErrorTypes.js';

const ENCRYPTION_KEY = config.mongoEncryptionKey;

export function encrypt(text) {
  try {
    if (!text) return null;
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
  } catch (error) {
    throw new Error(ErrorTypes.ENCRYPTION_ERROR, 'Encryption failed', { error });
  }
}

export function decrypt(ciphertext) {
  try {
    if (!ciphertext) return null;
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    throw new Error(ErrorTypes.ENCRYPTION_ERROR, 'Decryption failed', { error });
  }
}

export function hash(text) {
  try {
    if (!text) return null;
    return CryptoJS.SHA256(text).toString();
  } catch (error) {
    throw new Error(ErrorTypes.ENCRYPTION_ERROR, 'Hashing failed', { error });
  }
}

export function generateRandomKey(length = 32) {
  try {
    return CryptoJS.lib.WordArray.random(length).toString();
  } catch (error) {
    throw new Error(ErrorTypes.ENCRYPTION_ERROR, 'Key generation failed', { error });
  }
}