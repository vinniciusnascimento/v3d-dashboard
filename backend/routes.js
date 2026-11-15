import express from 'express';
import db from './db.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get('/produtos', async (req, res) => {
    try {
        const [produtos] = await db.query(
            'SELECT * FROM products'
        );

        res.json(produtos);

    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            erro: 'Erro ao buscar produtos'
        });
    }
});

const storage = multer.diskStorage({
    // ajuste para a pasta assets/products do seu front
    destination: path.join(__dirname, "../assets/products"),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, file.originalname);   // nome único, evita sobrescrever
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }   // 2 MB, igual ao front
});

router.post("/produtos", upload.single("image"), async (req, res) => {
    try {
        const { name, desc, category, price, size, material, colors } = req.body;
        const image = req.file ? req.file.filename : null;

        await db.query(
            `INSERT INTO products (name, \`desc\`, category, price, size, material, colors, image)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, desc, category, price || null, size, material, colors, image]
        );

        res.status(201).json({ message: "Produto criado" });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao salvar produto" });
    }
});

router.put('/produtos/:id', upload.single('image'), async (req, res) => {
    try {
        console.log("id:", req.params.id);
        console.log("body:", req.body);
        console.log("file:", req.file);
        const { id } = req.params;
        const { name, desc, category, price, size, material, colors } = req.body;
        const image = req.file ? req.file.filename : null;

        const [result] = await db.query(
            `UPDATE products
                SET name = ?, \`desc\` = ?, category = ?, price = ?,
                    size = ?, material = ?, colors = ?,
                    image = COALESCE(?, image)
              WHERE id = ?`,
            [name, desc, category, price || null, size, material, colors, image, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ erro: "Produto não encontrado" });
        }

        res.json({ message: "Produto atualizado" });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao atualizar produto" });
    }
});

router.delete('/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            `DELETE FROM products
              WHERE id = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ erro: "Produto não encontrado" });
        }

        res.json({ message: "Produto Excluído" });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao excluir produto" });
    }
});

export default router;