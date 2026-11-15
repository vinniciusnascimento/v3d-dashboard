
import express from 'express';
import dotenv from 'dotenv';
import routes from './routes.js';
import db from './db.js';
import cors from 'cors';

dotenv.config({
    path: new URL('./.env', import.meta.url)
});

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

const PORT = Number(process.env.PORT) || 5000;

// Inicia o servidor apenas no ambiente local
if (!process.env.VERCEL) {
    async function iniciarServidor() {
        try {
            await db.query('SELECT 1');

            console.log('MySQL conectado com sucesso!');

            app.listen(PORT, () => {
                console.log(`Servidor rodando na porta ${PORT}`);
            });

        } catch (erro) {
            console.error('Erro na conexão MySQL:');
            console.error(erro.code, erro.message);
            process.exit(1);
        }
    }

    iniciarServidor();
}

export default app;