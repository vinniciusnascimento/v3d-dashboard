import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import routes from './routes.js';
import catalog from './catalog.js';
import db from './db.js';
import { auth, hasSession, requireSameOrigin, requireSession } from './auth.js';

const app = express();
const file = (path) => fileURLToPath(new URL(path, import.meta.url));

app.disable('x-powered-by');

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store');
    next();
}

app.get(['/login', '/login.html'], noStore, async (req, res) => {
    if (await hasSession(req)) return res.redirect('/');
    res.sendFile(file('../login.html'), { cacheControl: false });
});

app.get(['/', '/index.html'], noStore, async (req, res) => {
    if (!await hasSession(req)) return res.redirect('/login');
    res.sendFile(file('../index.html'), { cacheControl: false });
});

app.use('/api', noStore, requireSameOrigin);
app.use('/api/auth', auth, (req, res) => res.sendStatus(404));
app.use('/api', catalog);
app.use('/api', requireSession, express.json(), routes);

if (!process.env.VERCEL) {
    for (const asset of ['app.js', 'auth.js', 'finance.js', 'orders.js', 'pages.js', 'style.css']) {
        app.get(`/${asset}`, (req, res) => res.sendFile(file(`../${asset}`)));
    }
    app.use('/assets', express.static(file('../assets')));
}

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
        return res.status(error.status).json({ error: 'Dados da requisição inválidos.' });
    }

    console.error('Falha no servidor:', error.code ?? error.name);
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
});

if (!process.env.VERCEL && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT) || 5000;
    db.query('SELECT 1')
        .then(() => app.listen(port, () => console.log(`Servidor rodando na porta ${port}`)))
        .catch((error) => {
            console.error('Erro na conexão MySQL:', error.code ?? error.name);
            process.exit(1);
        });
}

export default app;