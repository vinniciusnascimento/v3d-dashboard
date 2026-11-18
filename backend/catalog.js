import express from 'express';
import db from './db.js';

const catalog = express.Router();
const storeOrigin = 'https://site-v3d.vercel.app';
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

function allowStoreOrigin(req, res) {
    res.vary('Origin');
    if (req.get('Origin') !== storeOrigin) return false;
    res.set('Access-Control-Allow-Origin', storeOrigin);
    return true;
}

catalog.get('/produtos', async (req, res, next) => {
    if (!allowStoreOrigin(req, res)) return next();

    const [products] = await db.execute(`
        SELECT p.id, p.name, p.category, p.\`desc\`,
               p.size, p.material, p.colors, p.price,
               (pi.product_id IS NOT NULL) AS has_image,
               CASE WHEN pi.product_id IS NOT NULL THEN 'catalogo' END AS image
        FROM products p
        LEFT JOIN product_images pi ON pi.product_id = p.id
    `);
    res.json(products);
});

catalog.get('/produtos/:id/imagem', async (req, res, next) => {
    const fromStore = allowStoreOrigin(req, res);
    // Imagens carregadas por <img> podem chegar s? com Referer.
    if (!fromStore && !req.get('Referer')?.startsWith(`${storeOrigin}/`)) return next();

    if (!/^[1-9][0-9]{0,9}$/.test(req.params.id)) return res.sendStatus(404);

    const [[image]] = await db.execute(`
        SELECT pi.mime, pi.data
        FROM product_images pi
        JOIN products p ON p.id = pi.product_id
        WHERE p.id = ?
    `, [req.params.id]);

    if (!image || !imageTypes.has(image.mime)) return res.sendStatus(404);
    res.set('Content-Type', image.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(image.data);
});

export default catalog;
