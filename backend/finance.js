import express from 'express';
import db from './db.js';

const router = express.Router();

/* ============================================================
   Financeiro: lançamentos de receitas e despesas

   - Receitas de pedidos entram sozinhas quando o pedido chega em
     "concluido" (veja sincronizarReceitas, usada em routes.js).
   - Despesas (e receitas avulsas) são lançadas à mão pela aba Financeiro.
   - Lançamentos ligados a um pedido (order_id preenchido) só mudam
     pelo pedido; os manuais podem ser editados e excluídos aqui.
   ============================================================ */

const TIPOS = ['receita', 'despesa'];
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Tabela ---------- */

// O projeto não tem script de migração, então a tabela se cria sozinha
// na primeira vez que o Financeiro é usado (precisa de permissão CREATE).
let tabelaPronta = null;

export function garantirTabelaFinanceiro() {
    if (!tabelaPronta) {
        tabelaPronta = db.query(`
            CREATE TABLE IF NOT EXISTS finance_entries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('receita', 'despesa') NOT NULL,
                description VARCHAR(255) NOT NULL,
                category VARCHAR(60) NOT NULL DEFAULT 'Outros',
                amount DECIMAL(10, 2) NOT NULL,
                entry_date DATE NOT NULL,
                order_id INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_finance_order (order_id),
                KEY idx_finance_date (entry_date)
            ) DEFAULT CHARSET = utf8mb4
        `).catch((erro) => {
            tabelaPronta = null; // tenta de novo na próxima chamada
            throw erro;
        });
    }

    return tabelaPronta;
}

/* ---------- Utilitários ---------- */

// "Hoje" no fuso de Maceió. O servidor (Vercel) roda em UTC, e à noite
// a data de lá já seria a de amanhã.
function hojeBrasil() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataValida(texto) {
    if (typeof texto !== 'string' || !DATA_REGEX.test(texto)) return false;

    const data = new Date(`${texto}T00:00:00Z`);
    return !isNaN(data) && data.toISOString().slice(0, 10) === texto;
}

const arredondar = (valor) => Math.round(valor * 100) / 100;

function descricaoDoPedido(pedido) {
    const numero = `#${String(pedido.number).padStart(3, '0')}`;
    const quantidade = Number(pedido.quantity) || 1;

    return `Pedido ${numero} — ${pedido.customer} (${quantidade}× ${pedido.product})`.slice(0, 255);
}

/* ---------- Ligação com os pedidos ---------- */

// Deixa o Financeiro em dia com a situação dos pedidos informados:
//  - pedido "concluido" com valor  -> garante UMA receita dele (nunca duplica)
//  - pedido em qualquer outra etapa -> remove a receita automática, se existir
// Com `atualizar`, uma receita que já existe tem valor e descrição refeitos
// (usado ao editar o pedido). Sem ele, o lançamento é preservado como está.
// Deve rodar dentro da transação do chamador (conn).
export async function sincronizarReceitas(conn, ids, { atualizar = false } = {}) {
    if (!ids.length) return;

    const [pedidos] = await conn.query(
        'SELECT id, number, customer, product, quantity, price, status FROM orders WHERE id IN (?)',
        [ids]
    );

    const hoje = hojeBrasil();

    for (const pedido of pedidos) {
        const valor = Number(pedido.price);
        const concluido = pedido.status === 'concluido' && valor > 0;

        if (!concluido) {
            await conn.query('DELETE FROM finance_entries WHERE order_id = ?', [pedido.id]);
            continue;
        }

        const reescrever = atualizar
            ? 'amount = VALUES(amount), description = VALUES(description)'
            : 'id = id';

        await conn.query(
            `INSERT INTO finance_entries (type, description, category, amount, entry_date, order_id)
             VALUES ('receita', ?, 'Pedidos', ?, ?, ?)
             ON DUPLICATE KEY UPDATE ${reescrever}`,
            [descricaoDoPedido(pedido), arredondar(valor), hoje, pedido.id]
        );
    }
}

// Pedido excluído do quadro: o dinheiro já entrou, então a receita fica
// no histórico. Ela só deixa de ser "de pedido" (vira lançamento manual).
export async function desvincularReceita(orderId) {
    await garantirTabelaFinanceiro();
    await db.query('UPDATE finance_entries SET order_id = NULL WHERE order_id = ?', [orderId]);
}

/* ---------- Validação ---------- */

function lerLancamento(body = {}) {
    const type = body.type;
    if (!TIPOS.includes(type)) return { erro: 'Tipo inválido' };

    const description = String(body.description ?? '').trim();
    if (!description) return { erro: 'Informe uma descrição' };
    if (description.length > 255) return { erro: 'A descrição deve ter no máximo 255 caracteres' };

    const amount = arredondar(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { erro: 'Informe um valor maior que zero' };
    if (amount > 99999999.99) return { erro: 'Valor muito alto' };

    const category = String(body.category ?? '').trim().slice(0, 60) || 'Outros';

    const entry_date = body.entry_date;
    if (!dataValida(entry_date)) return { erro: 'Data inválida' };

    return { valores: { type, description, category, amount, entry_date } };
}

/* ---------- Rotas (montadas em /api/finance) ---------- */

// Lista os lançamentos do período (?from=AAAA-MM-DD&to=AAAA-MM-DD) e os totais
router.get('/', async (req, res) => {
    try {
        await garantirTabelaFinanceiro();

        const { from, to } = req.query;
        const filtros = [];
        const params = [];

        if (from) {
            if (!dataValida(from)) return res.status(400).json({ erro: 'Data inicial inválida' });
            filtros.push('entry_date >= ?');
            params.push(from);
        }

        if (to) {
            if (!dataValida(to)) return res.status(400).json({ erro: 'Data final inválida' });
            filtros.push('entry_date <= ?');
            params.push(to);
        }

        const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT id, type, description, category, amount,
                    DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, order_id
               FROM finance_entries
               ${where}
           ORDER BY entry_date DESC, id DESC`,
            params
        );

        const [totais] = await db.query(
            `SELECT type, COALESCE(SUM(amount), 0) AS total
               FROM finance_entries
               ${where}
           GROUP BY type`,
            params
        );

        const somar = (tipo) => Number(totais.find((t) => t.type === tipo)?.total ?? 0);
        const receitas = arredondar(somar('receita'));
        const despesas = arredondar(somar('despesa'));

        res.json({
            entries: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
            summary: { receitas, despesas, lucro: arredondar(receitas - despesas) }
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar lançamentos' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { erro, valores } = lerLancamento(req.body);
        if (erro) return res.status(400).json({ erro });

        await garantirTabelaFinanceiro();

        const [result] = await db.query(
            `INSERT INTO finance_entries (type, description, category, amount, entry_date)
             VALUES (?, ?, ?, ?, ?)`,
            [valores.type, valores.description, valores.category, valores.amount, valores.entry_date]
        );

        res.status(201).json({ id: result.insertId });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao salvar lançamento' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { erro, valores } = lerLancamento(req.body);
        if (erro) return res.status(400).json({ erro });

        await garantirTabelaFinanceiro();

        const [[atual]] = await db.query(
            'SELECT order_id FROM finance_entries WHERE id = ?',
            [req.params.id]
        );

        if (!atual) return res.status(404).json({ erro: 'Lançamento não encontrado' });

        if (atual.order_id !== null) {
            return res.status(400).json({
                erro: 'Este lançamento vem de um pedido. Altere o valor no pedido.'
            });
        }

        await db.query(
            `UPDATE finance_entries
                SET type = ?, description = ?, category = ?, amount = ?, entry_date = ?
              WHERE id = ?`,
            [valores.type, valores.description, valores.category, valores.amount, valores.entry_date, req.params.id]
        );

        res.json({ message: 'Lançamento atualizado' });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao atualizar lançamento' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await garantirTabelaFinanceiro();

        const [[atual]] = await db.query(
            'SELECT order_id FROM finance_entries WHERE id = ?',
            [req.params.id]
        );

        if (!atual) return res.status(404).json({ erro: 'Lançamento não encontrado' });

        if (atual.order_id !== null) {
            return res.status(400).json({
                erro: 'Este lançamento vem de um pedido. Mova o pedido para outra etapa para removê-lo.'
            });
        }

        await db.query('DELETE FROM finance_entries WHERE id = ?', [req.params.id]);

        res.json({ message: 'Lançamento excluído' });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao excluir lançamento' });
    }
});

export default router;
