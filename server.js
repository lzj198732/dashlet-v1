const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8989);
const APP_DIR = fs.existsSync(path.join(__dirname, 'app', 'index.html'))
    ? path.join(__dirname, 'app')
    : (fs.existsSync(path.join(__dirname, 'index.html')) ? __dirname : path.join(__dirname, 'app'));
const DATA_DIR = path.join(APP_DIR, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret');
const COOKIE_NAME = 'dashlet_session';
const SESSION_DAYS = 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getSecret() {
    if (fs.existsSync(SECRET_FILE)) {
        return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
}

const SECRET = getSecret();

function loadUsers() {
    const data = readJson(USERS_FILE, { users: [] });
    return Array.isArray(data.users) ? data.users : [];
}

function saveUsers(users) {
    writeJson(USERS_FILE, { users });
}

function scryptHash(password, salt) {
    return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: scryptHash(password, salt) };
}

function verifyPassword(password, salt, hash) {
    const next = scryptHash(password, salt);
    const a = Buffer.from(next, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function publicUser(user) {
    return { id: user.id, username: user.username, role: user.role };
}

function signToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    header.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        out[key] = decodeURIComponent(val);
    });
    return out;
}

function setSessionCookie(res, token) {
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function createSession(user) {
    return signToken({
        uid: user.id,
        exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    });
}

function findUserById(id) {
    return loadUsers().find((u) => u.id === id) || null;
}

function currentUser(req) {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyToken(cookies[COOKIE_NAME]);
    if (!payload) return null;
    const user = findUserById(payload.uid);
    return user ? publicUser(user) : null;
}

function validUsername(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 32 && !/\s/.test(name.trim());
}

function validPassword(password) {
    return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

const loginAttempts = new Map();

function clientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

function isLocked(ip) {
    const rec = loginAttempts.get(ip);
    if (!rec) return false;
    if (Date.now() - rec.start > LOGIN_WINDOW_MS) {
        loginAttempts.delete(ip);
        return false;
    }
    return rec.count >= LOGIN_MAX_ATTEMPTS;
}

function hitLogin(ip) {
    const now = Date.now();
    const rec = loginAttempts.get(ip);
    if (!rec || now - rec.start > LOGIN_WINDOW_MS) {
        loginAttempts.set(ip, { start: now, count: 1 });
        return;
    }
    rec.count += 1;
}

function isPublicPath(pathname) {
    if (pathname === '/' || pathname === '/index.html') return true;
    if (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/assets/')) return true;
    if (pathname === '/public/custom.css') return true;
    if (pathname === '/favicon.ico' || pathname === '/assets/logo.png' || pathname === '/assets/default.png') return true;
    if (pathname === '/api/auth/status' || pathname === '/api/auth/login' || pathname === '/api/auth/setup') return true;
    return false;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
    const blocked = ['/data', '/server.js', '/entrypoint.sh', '/package.json', '/package-lock.json', '/Dockerfile'];
    if (blocked.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
        return res.status(404).end();
    }
    next();
});

app.use((req, res, next) => {
    if (isPublicPath(req.path)) return next();
    if (currentUser(req)) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    return res.status(401).send('Unauthorized');
});

app.get('/api/auth/status', (req, res) => {
    const users = loadUsers();
    const user = currentUser(req);
    res.json({
        ok: true,
        setupRequired: users.length === 0,
        authenticated: Boolean(user),
        user
    });
});

app.post('/api/auth/setup', (req, res) => {
    const users = loadUsers();
    if (users.length > 0) {
        return res.status(400).json({ ok: false, error: 'exists' });
    }
    const username = (req.body && req.body.username || '').trim();
    const password = req.body && req.body.password;
    if (!username || !password) return res.status(400).json({ ok: false, error: 'required' });
    if (!validUsername(username)) return res.status(400).json({ ok: false, error: 'username' });
    if (!validPassword(password)) return res.status(400).json({ ok: false, error: 'short' });
    const creds = hashPassword(password);
    const user = {
        id: crypto.randomBytes(12).toString('hex'),
        username,
        role: 'admin',
        salt: creds.salt,
        hash: creds.hash,
        createdAt: new Date().toISOString()
    };
    saveUsers([user]);
    setSessionCookie(res, createSession(user));
    res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
    const ip = clientIp(req);
    if (isLocked(ip)) return res.status(429).json({ ok: false, error: 'locked' });
    const username = (req.body && req.body.username || '').trim();
    const password = req.body && req.body.password;
    if (!username || !password) return res.status(400).json({ ok: false, error: 'required' });
    const user = loadUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
        hitLogin(ip);
        return res.status(401).json({ ok: false, error: 'invalid' });
    }
    loginAttempts.delete(ip);
    setSessionCookie(res, createSession(user));
    res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
});

app.post('/api/auth/password', (req, res) => {
    const me = currentUser(req);
    if (!me) return res.status(401).json({ ok: false, error: 'unauthorized' });
    const currentPassword = req.body && req.body.currentPassword;
    const newPassword = req.body && req.body.newPassword;
    if (!currentPassword || !newPassword) return res.status(400).json({ ok: false, error: 'required' });
    if (!validPassword(newPassword)) return res.status(400).json({ ok: false, error: 'short' });
    const users = loadUsers();
    const user = users.find((u) => u.id === me.id);
    if (!user || !verifyPassword(currentPassword, user.salt, user.hash)) {
        return res.status(401).json({ ok: false, error: 'invalid' });
    }
    const creds = hashPassword(newPassword);
    user.salt = creds.salt;
    user.hash = creds.hash;
    saveUsers(users);
    res.json({ ok: true });
});

app.get('/api/auth/users', (req, res) => {
    const me = currentUser(req);
    if (!me) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (me.role !== 'admin') return res.status(403).json({ ok: false, error: 'unauthorized' });
    res.json({ ok: true, users: loadUsers().map(publicUser) });
});

app.post('/api/auth/users', (req, res) => {
    const me = currentUser(req);
    if (!me) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (me.role !== 'admin') return res.status(403).json({ ok: false, error: 'unauthorized' });
    const username = (req.body && req.body.username || '').trim();
    const password = req.body && req.body.password;
    const role = req.body && req.body.role === 'admin' ? 'admin' : 'user';
    if (!username || !password) return res.status(400).json({ ok: false, error: 'required' });
    if (!validUsername(username)) return res.status(400).json({ ok: false, error: 'username' });
    if (!validPassword(password)) return res.status(400).json({ ok: false, error: 'short' });
    const users = loadUsers();
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ ok: false, error: 'exists' });
    }
    const creds = hashPassword(password);
    const user = {
        id: crypto.randomBytes(12).toString('hex'),
        username,
        role,
        salt: creds.salt,
        hash: creds.hash,
        createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
    res.json({ ok: true, user: publicUser(user) });
});

app.delete('/api/auth/users/:id', (req, res) => {
    const me = currentUser(req);
    if (!me) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (me.role !== 'admin') return res.status(403).json({ ok: false, error: 'unauthorized' });
    const id = req.params.id;
    if (id === me.id) return res.status(400).json({ ok: false, error: 'self' });
    const users = loadUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return res.status(404).json({ ok: false, error: 'generic' });
    const admins = users.filter((u) => u.role === 'admin');
    if (target.role === 'admin' && admins.length <= 1) {
        return res.status(400).json({ ok: false, error: 'lastAdmin' });
    }
    saveUsers(users.filter((u) => u.id !== id));
    res.json({ ok: true });
});

app.use(express.static(APP_DIR, { extensions: ['html'] }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashlet running at http://localhost:${PORT}`);
});
