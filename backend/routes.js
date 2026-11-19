import express from 'express';
import db from './db.js';
import multer from 'multer';
import financeRouter, {
    garantirTabelaFinanceiro,
    sincronizarReceitas,
    desvincularReceita,
    normalizarPagamento,
    normalizarParcelas,
    listarParcelasPagas,
    valorParcelaPrevista,
    centavos,
    dataValida
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

// Cada pedido pode conter vários produtos. A tabela é criada automaticamente.
let orderItemsReady;
function garantirTabelaItens() {
    if (!orderItemsReady) {
        orderItemsReady = db.query(`CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_id INT NULL,
            product_name VARCHAR(120) NOT NULL,
            quantity INT NOT NULL,
            unit_price DECIMAL(12,2) NULL,
            INDEX idx_order_items_order (order_id)
        )`).catch(err => { orderItemsReady = null; throw err; });
    }
    return orderItemsReady;
}

function validarItens(body) {
    const source = Array.isArray(body.items) ? body.items : [
        { name: body.product, quantity: body.quantity || 1,
          unit_price: body.price == null ? null : Number(body.price) / Number(body.quantity || 1) }
    ];
    if (!source.length || source.length > 100) return null;
    const items = source.map(item => ({
        product_id: item.product_id == null || item.product_id === '' ? null : Number(item.product_id),
        name: String(item.name || item.product_name || '').trim(),
        quantity: Number(item.quantity),
        unit_price: item.unit_price === '' || item.unit_price == null ? null : Number(item.unit_price)
    }));
    if (items.some(item => !item.name || item.name.length > 120 || !Number.isInteger(item.quantity) ||
            item.quantity < 1 || item.quantity > 100000 ||
            (item.product_id !== null && (!Number.isInteger(item.product_id) || item.product_id < 1)) ||
            (item.unit_price !== null && (!Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > 99999999)))) return null;
    return items;
}
function resumoItens(items) {
    return {
        product: items.map(i => i.name).join(', ').slice(0, 120),
        quantity: items.reduce((sum, i) => sum + i.quantity, 0),
        price: items.some(i => i.unit_price === null) ? null :
            Math.round(items.reduce((sum, i) => sum + Math.round(i.unit_price * 100) * i.quantity, 0)) / 100
    };
}
async function gravarItens(conn, id, items) {
    await conn.query('DELETE FROM order_items WHERE order_id = ?', [id]);
    for (const item of items) {
        await conn.query(`INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
                          VALUES (?, ?, ?, ?, ?)`, [id, item.product_id, item.name, item.quantity, item.unit_price]);
    }
}
async function juntarItens(orders) {
    if (!orders.length) return orders;
    const ids = orders.map(o => o.id);
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`, ids);
    const byOrder = new Map();
    for (const item of rows) {
        if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
        byOrder.get(item.order_id).push({ product_id: item.product_id, name: item.product_name,
            quantity: item.quantity, unit_price: item.unit_price });
    }
    for (const order of orders) {
        order.items = byOrder.get(order.id) || [{ name: order.product,
            quantity: Number(order.quantity) || 1,
            unit_price: order.price == null ? null : Number(order.price) / (Number(order.quantity) || 1), product_id: null }];
    }
    return orders;
}


router.get("/orders", async (req, res) => {
    try {
        await garantirTabelaFinanceiro();
        await garantirTabelaItens();
        const [rows] = await db.query(
            "SELECT * FROM orders ORDER BY position ASC, id ASC"
        );

        res.json(await juntarItens(rows));
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao buscar pedidos" });
    }
});

router.get('/orders/:id/installments', async (req, res) => {
    try {
        await garantirTabelaFinanceiro();
        const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (!order) return res.status(404).json({ erro: 'Pedido não encontrado' });
        if (order.payment_method !== 'credito') return res.status(400).json({ erro: 'Pedido sem pagamento no crédito' });

        const installments = await listarParcelasPagas(db, order);
        const total = centavos(order.price);
        const received = installments.reduce((sum, installment) => sum + centavos(installment.amount), 0);

        const lastNumber = Math.max(order.installment_sequence, installments.at(-1)?.number ?? 0);
        res.json({
            installments,
            total: total / 100,
            received: received / 100,
            pending: Math.max(0, total - received) / 100,
            next_number: lastNumber + 1
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao carregar parcelas' });
    }
});

router.post('/orders/:id/installments', (req, res) => gravarParcela(req, res, true));
router.put('/orders/:id/installments/:number', (req, res) => gravarParcela(req, res, false));

async function gravarParcela(req, res, criar) {
    const { paid = criar ? true : undefined, paid_at, amount } = req.body || {};
    const number = criar ? req.body?.number : Number(req.params.number);
    if (typeof paid !== 'boolean' || (criar && !paid) || !Number.isSafeInteger(number) || number < 1) {
        return res.status(400).json({ erro: 'Parcela ou pagamento inválido' });
    }
    if (paid && !dataValida(paid_at)) {
        return res.status(400).json({ erro: 'Informe uma data de pagamento válida' });
    }
    if (paid && (criar || amount !== undefined)) {
        const formatoValido = ['number', 'string'].includes(typeof amount)
            && /^\d{1,8}(?:\.\d{1,2})?$/.test(String(amount));
        if (!formatoValido || centavos(amount) < 1) {
            return res.status(400).json({ erro: 'Informe um valor pago maior que zero, com até duas casas decimais' });
        }
    }

    let conn;
    try {
        await garantirTabelaFinanceiro();
        conn = await db.getConnection();
        await conn.beginTransaction();
        const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
        if (!order || order.payment_method !== 'credito') {
            await conn.rollback();
            return res.status(order ? 400 : 404).json({ erro: 'Pedido no crédito não encontrado' });
        }

        const parcelas = await listarParcelasPagas(conn, order);
        const parcela = parcelas.find((item) => item.number === number);
        const ultima = Math.max(order.installment_sequence, parcelas.at(-1)?.number ?? 0);
        if (criar && number !== ultima + 1) {
            await conn.rollback();
            return res.status(409).json({ erro: 'As parcelas deste pedido mudaram. Confira os pagamentos antes de tentar novamente.' });
        }
        const prevista = number <= (Number(order.installments) || 1);
        if (!criar && paid && !parcela && (amount !== undefined || !prevista)) {
            await conn.rollback();
            return res.status(404).json({ erro: 'Parcela não encontrada' });
        }

        if (paid) {
            const total = centavos(order.price);
            if (total <= 0) {
                await conn.rollback();
                return res.status(400).json({ erro: 'Informe o valor do pedido antes de registrar pagamentos' });
            }

            const valor = centavos(amount ?? parcela?.amount ?? valorParcelaPrevista(order, number));
            const outras = parcelas.reduce((soma, item) => item.number === number ? soma : soma + centavos(item.amount), 0);
            if (valor < 1 || valor > total - outras) {
                await conn.rollback();
                return res.status(400).json({ erro: 'O valor pago deve ser positivo e caber no saldo do pedido' });
            }
            await conn.query(`INSERT INTO order_installment_payments (order_id, installment_number, paid_at, amount)
                VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE paid_at = VALUES(paid_at), amount = VALUES(amount)`,
                [order.id, number, paid_at, valor / 100]);
        } else {
            await conn.query('DELETE FROM order_installment_payments WHERE order_id = ? AND installment_number = ?', [order.id, number]);
        }

        const sequencia = Math.max(ultima, paid ? number : 0);
        if (sequencia > order.installment_sequence) {
            await conn.query('UPDATE orders SET installment_sequence = ? WHERE id = ?', [sequencia, order.id]);
        }
        await sincronizarReceitas(conn, [order.id], { atualizar: true });
        await conn.commit();
        res.status(criar ? 201 : 200).json({ ok: true });
    } catch (error) {
        if (conn) await conn.rollback().catch(() => {});
        console.error(error);
        res.status(500).json({ erro: 'Erro ao salvar pagamento da parcela' });
    } finally {
        if (conn) conn.release();
    }
}

router.post("/orders", async (req, res) => {
    let conn;
    try {
        const { customer, deadline, notes, payment_method, installments } = req.body;
        const items = validarItens(req.body);
        const pagamento = normalizarPagamento(payment_method);
        const parcelas = normalizarParcelas(pagamento, installments);
        if (!customer?.trim() || !items) return res.status(400).json({ erro: 'Informe cliente e ao menos um produto válido' });
        if (pagamento === undefined || parcelas === undefined) return res.status(400).json({ erro: 'Pagamento ou parcelas inválidos' });
        await garantirTabelaFinanceiro();
        await garantirTabelaItens();
        const resumo = resumoItens(items);
        conn = await db.getConnection();
        await conn.beginTransaction();
        // Serializa o cálculo do número sequencial para evitar duplicidade entre pedidos simultâneos.
        await conn.query('SELECT GET_LOCK(?, 10) AS acquired', ['v3d_order_number']);
        const [[{ nextNumber }]] = await conn.query('SELECT COALESCE(MAX(number), 0) + 1 AS nextNumber FROM orders');
        const [[{ nextPosition }]] = await conn.query("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM orders WHERE status = 'aguardando'");
        const [result] = await conn.query(`INSERT INTO orders
            (number, customer, product, quantity, price, status, deadline, notes, position, payment_method, installments)
            VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, ?, ?)`,
            [nextNumber, customer.trim(), resumo.product, resumo.quantity, resumo.price,
             deadline || null, notes || null, nextPosition, pagamento, parcelas]);
        await gravarItens(conn, result.insertId, items);
        await conn.commit();
        res.status(201).json({ id: result.insertId, number: nextNumber });
    } catch (erro) {
        if (conn) await conn.rollback().catch(() => {});
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao criar pedido' });
    } finally {
        if (conn) {
            await conn.query('SELECT RELEASE_LOCK(?)', ['v3d_order_number']).catch(() => {});
            conn.release();
        }
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
        await garantirTabelaItens();

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
        const { customer, deadline, notes, payment_method, installments } = req.body;
        const items = validarItens(req.body);
        const { product, quantity, price } = items ? resumoItens(items) : {};

        const pagamento = normalizarPagamento(payment_method);
        if (pagamento === undefined) {
            return res.status(400).json({ erro: "Forma de pagamento inválida" });
        }

        const parcelas = normalizarParcelas(pagamento, installments);
        if (parcelas === undefined) {
            return res.status(400).json({ erro: "Número de parcelas inválido (use de 1 a 12)" });
        }

        if (!customer?.trim() || !items) {
            return res.status(400).json({
                erro: "Cliente e produto são obrigatórios"
            });
        }

        await garantirTabelaFinanceiro();
        await garantirTabelaItens();

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[existing]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
        const [[{ paidCount }]] = await conn.query(
            'SELECT COUNT(*) AS paidCount FROM order_installment_payments WHERE order_id = ?', [id]
        );
        if (existing && Number(paidCount) > 0 && (
            pagamento !== existing.payment_method ||
            (Number(parcelas) || 1) !== (Number(existing.installments) || 1) ||
            Number(price) !== Number(existing.price)
        )) {
            await conn.rollback();
            return res.status(400).json({ erro: 'Remova os pagamentos antes de alterar o valor ou o parcelamento do pedido' });
        }

        const [result] = await conn.query(
            `UPDATE orders
                SET customer = ?, product = ?, quantity = ?, price = ?,
                    deadline = ?, notes = ?, payment_method = ?, installments = ?
              WHERE id = ?`,
            [customer, product, quantity || 1, price ?? null, deadline || null, notes || null, pagamento, parcelas, id]
        );

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ erro: "Pedido não encontrado" });
        }

        await gravarItens(conn, id, items);

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
    let conn;
    try {
        const { id } = req.params;
        await garantirTabelaFinanceiro();
        await garantirTabelaItens();
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[pedido]] = await conn.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [id]);
        if (!pedido) {
            await conn.rollback();
            return res.status(404).json({ erro: "Pedido não encontrado" });
        }

        // A receita de um pedido concluído continua no Financeiro.
        await desvincularReceita(conn, id);
        await conn.query('DELETE FROM order_installment_payments WHERE order_id = ?', [id]);
        await conn.query('DELETE FROM order_items WHERE order_id = ?', [id]);
        await conn.query('DELETE FROM orders WHERE id = ?', [id]);
        await conn.commit();

        res.json({ message: "Pedido excluído com sucesso" });
    } catch (erro) {
        if (conn) await conn.rollback().catch(() => {});
        console.error(erro);
        res.status(500).json({ erro: "Erro ao excluir pedido" });
    } finally {
        if (conn) conn.release();
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
