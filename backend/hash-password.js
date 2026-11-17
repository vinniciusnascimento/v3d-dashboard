import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from './passwords.js';

const minLength = 6;
const maxLength = 256;

const output = new Writable({ write(chunk, encoding, done) { done(); } });
const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: Boolean(process.stdin.isTTY),
});

process.stderr.write(`Senha (${minLength} a ${maxLength} caracteres, entrada oculta): `);
try {
    const password = await terminal.question('');
    if (password.length < minLength || password.length > maxLength) {
        console.error(`\nUse de ${minLength} a ${maxLength} caracteres.`);
        process.exitCode = 1;
    } else {
        process.stderr.write('\n');
        console.log(await hashPassword(password));
    }
} finally {
    terminal.close();
}