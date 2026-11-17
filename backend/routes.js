import express from 'express';
import db from './db.js';
import multer from 'multer';
import financeRouter, {
    garantirTabelaFinanceiro,
    sincronizarReceitas,
    desvincularReceita,
    normalizarPagamento
} from './finance.js';

const router = express.Router();

// /finance
router.use('/finance', financeRouter);

// /produtos

// Na Vercel o disco é somente leitura (e não persiste), então a imagem
// fica na memória durante o upload e é gravada no MySQL (tabela product_images).
const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },   // 2 MB, igual ao front
    fileFilter: (req, file, cb) => {
        if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
            return cb(new Error('TIPO_INVALIDO'));
        }
        cb(null, true);
    }
});

// Roda o multer e devolve JSON em vez de deixar o Express responder 500 genérico
const receberImagem = (req, res, next) => {
    upload.single('image')(req, res, (erro) => {
        if (!erro) return next();

        if (erro.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ erro: 'A imagem deve ter no máximo 2 MB' });
        }
        if (erro.message === 'TIPO_INVALIDO') {
            return res.status(400).json({ erro: 'Use uma imagem PNG, JPG ou WebP' });
        }
        console.error(erro);
        res.status(400).json({ erro: 'Erro ao receber a imagem' });
    });
};

const salvarImagem = (conn, productId, file) =>
    conn.query(
        `INSERT INTO product_images (product_id, mime, data)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)`,
        [productId, file.mimetype, file.buffer]
    );

router.get('/produtos', async (req, res) => {
    try {
        const [produtos] = await db.query(
            `SELECT p.*, (pi.product_id IS NOT NULL) AS has_image
               FROM products p
          LEFT JOIN product_images pi ON pi.product_id = p.id`
        );

        res.json(produtos);

    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            erro: 'Erro ao buscar produtos'
        });
    }
});

router.get('/produtos/:id/imagem', async (req, res) => {
    try {
        const [[img]] = await db.query(
            'SELECT mime, data FROM product_images WHERE product_id = ?',
            [req.params.id]
        );

        if (!img) return res.status(404).end();

        res.set('Content-Type', img.mime);
        res.set('Cache-Control', 'public, max-age=0, must-revalidate');
        res.send(img.data);
    } catch (erro) {
        console.error(erro);
        res.status(500).end();
    }
});

router.post("/produtos", receberImagem, async (req, res) => {
    try {
        const { name, desc, category, price, size, material, colors } = req.body;
        const file = req.file;

        const [result] = await db.query(
            `INSERT INTO products (name, \`desc\`, category, price, size, material, colors, image)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, desc, category, price || null, size, material, colors, file ? file.originalname : null]
        );

        if (file) await salvarImagem(db, result.insertId, file);

        res.status(201).json({ message: "Produto criado", id: result.insertId });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao salvar produto" });
    }
});

router.put('/produtos/:id', receberImagem, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, desc, category, price, size, material, colors } = req.body;
        const file = req.file;
        const image = file ? file.originalname : null;

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

        if (file) await salvarImagem(db, id, file);

        res.json({ message: "Produto atualizado" });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao atualizar produto" });
    }
});

router.delete('/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM product_images WHERE product_id = ?', [id]);

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

// /pedidos

router.get("/orders", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM orders ORDER BY position ASC, id ASC"
        );

        res.json(rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao buscar pedidos" });
    }
});

router.post("/orders", async (req, res) => {
    try {
        const { customer, product, quantity, price, deadline, notes, payment_method } = req.body;

        const pagamento = normalizarPagamento(payment_method);
        if (pagamento === undefined) {
            return res.status(400).json({ erro: "Forma de pagamento inválida" });
        }

        if (!customer || !product) {
            return res.status(400).json({
                erro: "Cliente e produto são obrigatórios"
            });
        }

        // Garante a coluna payment_method antes do INSERT
        await garantirTabelaFinanceiro();

        // Número sequencial e posição no fim da coluna "aguardando"
        const [[{ nextNumber }]] = await db.query(
            "SELECT COALESCE(MAX(number), 0) + 1 AS nextNumber FROM orders"
        );
        const [[{ nextPosition }]] = await db.query(
            "SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM orders WHERE status = 'aguardando'"
        );

        const [result] = await db.query(
            `INSERT INTO orders
                (number, customer, product, quantity, price, status, deadline, notes, position, payment_method)
             VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, ?)`,
            [
                nextNumber,
                customer,
                product,
                quantity || 1,
                price ?? null,
                deadline || null,
                notes || null,
                nextPosition,
                pagamento
            ]
        );

        res.status(201).json({ id: result.insertId, number: nextNumber });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao criar pedido" });
    }
});


router.put("/orders/reordenar", async (req, res) => {
    const { status, ids } = req.body;
    const validos = ["aguardando", "imprimindo", "finalizacao", "concluido"];

    if (!validos.includes(status) || !Array.isArray(ids)) {
        return res.status(400).json({ erro: "Dados inválidos" });
    }

    let conn;
    try {
        // Antes da transação: criar tabela é DDL e encerraria a transação
        await garantirTabelaFinanceiro();

        conn = await db.getConnection();
        await conn.beginTransaction();

        for (let i = 0; i < ids.length; i++) {
            await conn.query(
                "UPDATE orders SET status = ?, position = ? WHERE id = ?",
                [status, i, ids[i]]
            );
        }

        // Pedido que chega em "concluido" vira receita no Financeiro;
        // se sai de "concluido", a receita dele é desfeita.
        await sincronizarReceitas(conn, ids);

        await conn.commit();
        res.json({ ok: true });
    } catch (erro) {
        if (conn) await conn.rollback().catch(() => { });

        console.error("ERRO PUT REORDENAR:", {
            message: erro.message,
            code: erro.code,
            sqlMessage: erro.sqlMessage,
            sqlState: erro.sqlState
        });

        res.status(500).json({
            erro: "Erro ao atualizar pedido",
            codigo: erro.code || null,
            mensagem: erro.sqlMessage || erro.message
        });
    } finally {
        // Sem isso a conexão nunca volta ao pool (limite de 5)
        if (conn) conn.release();
    }
});

router.put("/orders/:id", async (req, res) => {
    let conn;
    try {
        const { id } = req.params;
        const { customer, product, quantity, price, deadline, notes, payment_method } = req.body;

        const pagamento = normalizarPagamento(payment_method);
        if (pagamento === undefined) {
            return res.status(400).json({ erro: "Forma de pagamento inválida" });
        }

        if (!customer || !product) {
            return res.status(400).json({
                erro: "Cliente e produto são obrigatórios"
            });
        }

        await garantirTabelaFinanceiro();

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [result] = await conn.query(
            `UPDATE orders
                SET customer = ?, product = ?, quantity = ?, price = ?,
                    deadline = ?, notes = ?, payment_method = ?
              WHERE id = ?`,
            [customer, product, quantity || 1, price ?? null, deadline || null, notes || null, pagamento, id]
        );

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ erro: "Pedido não encontrado" });
        }

        // Pedido já concluído: o valor da receita acompanha a edição
        await sincronizarReceitas(conn, [id], { atualizar: true });

        await conn.commit();
        res.json({ message: "Pedido atualizado" });
    } catch (erro) {
        if (conn) await conn.rollback().catch(() => { });

        console.error(erro);
        res.status(500).json({ erro: "Erro ao atualizar pedido" });
    } finally {
        if (conn) conn.release();
    }
});

router.delete("/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // A receita de um pedido concluído continua no Financeiro
        await desvincularReceita(id);

        const [result] = await db.query(
            `DELETE FROM orders
             WHERE id = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                erro: "Pedido não encontrado"
            });
        }

        res.json({
            message: "Pedido excluído com sucesso"
        });

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Erro ao excluir pedido"
        });
    }
});

// Imagens

router.get('/produtos/:id/imagem', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT mime, data
             FROM product_images
             WHERE product_id = ?
             LIMIT 1`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Imagem não encontrada"
            });
        }

        const image = rows[0];

        const buffer = Buffer.isBuffer(image.data)
            ? image.data
            : Buffer.from(image.data);

        res.status(200);
        res.setHeader("Content-Type", image.mime || "image/webp");
        res.setHeader("Content-Length", buffer.length);

        return res.end(buffer);

    } catch (error) {
        console.error("Erro ao buscar imagem:", error);

        return res.status(500).json({
            error: "Erro ao carregar imagem"
        });
    }
});


export default router;