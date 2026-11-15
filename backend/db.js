
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({
    path: new URL('./.env', import.meta.url)
});

console.log('Usuário no db.js:', process.env.DB_USER);

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306
});

export default db;