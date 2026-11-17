import { createHash, randomBytes, randomInt } from 'node:crypto';
import express from 'express';
import db from './db.js';
import { verifyPassword } from './passwords.js';

export const auth = express.Router();

const sessionAge = 8 * 60 * 60 * 1000;
const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
const cookieName = secure ? '__Host-v3d_session' : 'v3d_session';
const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
const digest = (value) => createHash('sha256').update(value).digest();

function sessionId(req) {
    const cookie = (req.get('cookie') ?? '').split(';').find((part) => part.trimStart().startsWith(`${cookieName}=`));
    const token = cookie?.trim().slice(cookieName.length + 1);
    return token && /^[0-9a-f]{64}$/.test(token) ? digest(token) : null;
}

export async function hasSession(req) {
    const id = sessionId(req);
    if (!id) return false;

    const [sessions] = await db.execute(
        `SELECT 1 FROM dashboard_sessions AS s
         JOIN dashboard_users AS u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
           AND u.active = 1 AND s.credential_fingerprint = UNHEX(SHA2(u.password_hash, 256))`,
        [id],
    );
    return sessions.length > 0;
}

export async function requireSession(req, res, next) {
    if (!await hasSession(req)) {
        return res.status(401).json({ error: 'Entre para acessar o painel.' });
    }
    next();
}

export function requireSameOrigin(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    const fetchSite = req.get('sec-fetch-site');
    const origin = req.get('origin');
    const expected = `${secure || req.secure ? 'https' : 'http'}://${req.get('host')}`;
    if ((fetchSite && fetchSite !== 'same-origin') || (origin && origin !== expected)) {
        return res.status(403).json({ error: 'Origem da requisição inválida.' });
    }
    next();
}

async function attemptAllowed(scope, value, limit) {
    const key = digest(`${scope}:${value}`);
    await db.execute(
        `INSERT INTO dashboard_login_attempts (bucket, attempts, expires_at)
         VALUES (?, 1, CURRENT_TIMESTAMP + INTERVAL 15 MINUTE)
         ON DUPLICATE KEY UPDATE
             attempts = IF(expires_at <= CURRENT_TIMESTAMP, 1, LEAST(attempts + 1, ?)),
             expires_at = IF(expires_at <= CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL 15 MINUTE, expires_at)`,
        [key, limit + 1],
    );
    const [rows] = await db.execute('SELECT attempts FROM dashboard_login_attempts WHERE bucket = ?', [key]);
    return rows.length > 0 && rows[0].attempts <= limit;
}

auth.post('/login', express.json({ limit: '4kb' }), async (req, res) => {
    const { username, password } = req.body ?? {};
    const login = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!/^[a-z0-9_.-]{1,64}$/.test(login) || typeof password !== 'string'
        || password.length === 0 || password.length > 256) {
        return res.status(400).json({ error: 'Informe um usuário e uma senha válidos.' });
    }

    const limited = () => res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    const clientIP = (process.env.VERCEL && req.get('x-forwarded-for')) || req.socket.remoteAddress;
    if (!await attemptAllowed('ip', clientIP, 30)) return limited();

    if (!await attemptAllowed('user', login, 10)) return limited();

    const [users] = await db.execute(
        'SELECT id, password_hash, active FROM dashboard_users WHERE username = ?',
        [login],
    );
    const user = users[0];

    if (randomInt(32) === 0) {
        await db.execute('DELETE FROM dashboard_login_attempts WHERE expires_at <= CURRENT_TIMESTAMP LIMIT 100');
        await db.execute('DELETE FROM dashboard_sessions WHERE expires_at <= CURRENT_TIMESTAMP LIMIT 100');
    }

    if (!await verifyPassword(password, user?.password_hash) || !user?.active) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const token = randomBytes(32).toString('hex');
    const [result] = await db.execute(
        `INSERT INTO dashboard_sessions (token_hash, user_id, credential_fingerprint, expires_at)
         SELECT ?, id, UNHEX(SHA2(password_hash, 256)), CURRENT_TIMESTAMP + INTERVAL 8 HOUR
         FROM dashboard_users WHERE id = ? AND active = 1 AND password_hash = ?`,
        [digest(token), user.id, user.password_hash],
    );
    if (!result.affectedRows) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionAge }).sendStatus(204);
});

auth.post('/logout', async (req, res) => {
    const id = sessionId(req);
    if (id) await db.execute('DELETE FROM dashboard_sessions WHERE token_hash = ?', [id]);
    res.clearCookie(cookieName, cookieOptions).sendStatus(204);
});