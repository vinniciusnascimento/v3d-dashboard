import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const keyLength = 64;
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const format = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
const dummySalt = Buffer.alloc(16);
const dummyKey = Buffer.alloc(keyLength);

export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, keyLength, options);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, hash) {
    const parts = format.exec(hash ?? '');
    const salt = parts ? Buffer.from(parts[1], 'hex') : dummySalt;
    const expected = parts ? Buffer.from(parts[2], 'hex') : dummyKey;
    const actual = await deriveKey(password, salt, keyLength, options);
    return timingSafeEqual(actual, expected) && Boolean(parts);
}