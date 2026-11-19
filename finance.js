/* ============================================================
   Financeiro: receitas, despesas e lucro
   Depende de: app.js (escapeHtml) e lucide
   ============================================================ */

// Usa o mesmo endereço da API de pedidos (localhost:5000 em desenvolvimento,
// /api na Vercel), senão a requisição vai para o servidor estático (Live Server).
const FINANCE_API_URL = ORDERS_API_URL.replace(/\/orders$/, "/finance");

const FINANCE_CATEGORIES = {
    despesa: [
        "Material / filamento",
        "Energia",
        "Manutenção e peças",
        "Embalagem",
        "Frete",
        "Marketing",
        "Taxas",
        "Outros",
    ],
    receita: ["Venda avulsa", "Outros"],
};

let financeEntries = [];
const FINANCE_PAGE_SIZE = 10;
let financeCurrentPage = 1;
let financeRequestId = 0;   // descarta respostas antigas se o período mudar no meio
let financeEscHandler = null;

/* ---------- Utilitários ---------- */

function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}

// "YYYY-MM-DD" no fuso local (toISOString usaria UTC e podia mudar o dia)
function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatFinanceDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function getFinancePeriod(key) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const ranges = {
        "month": [new Date(year, month, 1), new Date(year, month + 1, 0)],
        "last-month": [new Date(year, month - 1, 1), new Date(year, month, 0)],
        "year": [new Date(year, 0, 1), new Date(year, 11, 31)],
    };

    const range = ranges[key];
    return range ? { from: localISODate(range[0]), to: localISODate(range[1]) } : {};
}

/* ---------- Resumo ---------- */

const financeAnimations = new WeakMap();

function animateFinanceMoney(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const previous = financeAnimations.get(element);
    if (previous) cancelAnimationFrame(previous.frame);

    const from = previous?.value ?? 0;
    const value = Number(target) || 0;
    const state = { value: from, frame: null };
    financeAnimations.set(element, state);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || from === value) {
        state.value = value;
        element.textContent = formatMoney(value);
        return;
    }

    element.textContent = formatMoney(from);
    const start = performance.now();
    const duration = 1000;

    function frame(now) {
        if (!element.isConnected) return;

        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        state.value = progress === 1 ? value : from + (value - from) * eased;
        element.textContent = formatMoney(state.value);

        if (progress < 1) state.frame = requestAnimationFrame(frame);
    }

    state.frame = requestAnimationFrame(frame);
}

function renderFinanceSummary(summary) {
    animateFinanceMoney("finance-income", summary.receitas);
    animateFinanceMoney("finance-expense", summary.despesas);
    animateFinanceMoney("finance-profit", summary.lucro);

    document.getElementById("finance-profit-card")
        .classList.toggle("is-negative", summary.lucro < 0);
}

/* ---------- Lista ---------- */

function renderFinanceList() {
    const list = document.getElementById("finance-list");
    if (!list || list.hasAttribute("aria-busy") || !financeEntries) return;

    const type = document.getElementById("finance-type-filter").value;
    const term = document.getElementById("finance-search").value.toLowerCase().trim();

    const entries = financeEntries.filter((entry) => {
        const matchType = !type || entry.type === type;
        const matchTerm = !term
            || entry.description.toLowerCase().includes(term)
            || entry.category.toLowerCase().includes(term);

        return matchType && matchTerm;
    });

    const totalPages = Math.max(1, Math.ceil(entries.length / FINANCE_PAGE_SIZE));
    financeCurrentPage = Math.min(financeCurrentPage, totalPages);
    const start = (financeCurrentPage - 1) * FINANCE_PAGE_SIZE;
    const pageEntries = entries.slice(start, start + FINANCE_PAGE_SIZE);

    if (!entries.length) {
        list.innerHTML = `<p class="products-empty">Nenhum lançamento encontrado.</p>`;
    } else {
        list.innerHTML = `
            <div class="table-wrapper">
                <table class="products-table table-cards finance-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th>Pagamento</th>
                            <th class="finance-th-amount">Valor</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageEntries.map(createFinanceRow).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    document.getElementById("finance-count").textContent =
        entries.length
            ? `${start + 1}–${start + pageEntries.length} de ${entries.length} ${entries.length === 1 ? "lançamento" : "lançamentos"}`
            : "0 lançamentos";

    document.getElementById("finance-pagination").hidden = entries.length <= FINANCE_PAGE_SIZE;
    document.getElementById("finance-page-status").textContent = `Página ${financeCurrentPage} de ${totalPages}`;
    document.getElementById("finance-previous-page").disabled = financeCurrentPage === 1;
    document.getElementById("finance-next-page").disabled = financeCurrentPage === totalPages;

    lucide.createIcons();
}

function createFinanceRow(entry) {
    const isIncome = entry.type === "receita";
    const fromOrder = entry.order_id !== null && entry.order_id !== undefined;

    const actions = fromOrder
        ? `<span class="finance-locked" title="Lançado pelo pedido: para alterar, edite o pedido">
               <i data-lucide="lock"></i>
           </span>`
        : `<button type="button" class="finance-edit" data-id="${entry.id}" aria-label="Editar lançamento" title="Editar">
               <i data-lucide="pencil"></i>
           </button>
           <button type="button" class="finance-delete" data-id="${entry.id}" aria-label="Excluir lançamento" title="Excluir">
               <i data-lucide="trash-2"></i>
           </button>`;

    return `
        <tr>
            <td data-label="Data">${formatFinanceDate(entry.entry_date)}</td>
            <td class="cell-title">
                <span class="finance-desc" title="${escapeHtml(entry.description)}">${escapeHtml(entry.description)}</span>
                ${fromOrder
            ? `<span class="finance-auto" title="Lançado automaticamente ao concluir o pedido"><i data-lucide="zap"></i>Automático</span>`
            : ""}
            </td>
            <td data-label="Categoria">${escapeHtml(entry.category)}</td>
            <td data-label="Pagamento">${isIncome && entry.payment_method ? escapeHtml(paymentDescription(entry.payment_method, entry.installments)) : "—"}</td>
            <td class="finance-amount cell-amount ${isIncome ? "income" : "expense"}">
                ${isIncome ? "+" : "−"} ${formatMoney(entry.amount)}
            </td>
            <td class="cell-actions"><div class="finance-actions">${actions}</div></td>
        </tr>
    `;
}

function financeTableSkeleton(rows) {
    const row = `
        <div class="skeleton-table-row">
            ${skeletonLine()}
            ${skeletonLine("skeleton-medium")}
            ${skeletonLine("skeleton-medium")}
            ${skeletonLine("skeleton-short")}
            ${skeletonLine()}
            ${skeletonLine("skeleton-medium")}
        </div>`;

    return `<div aria-hidden="true">${row.repeat(rows)}</div>`;
}

async function loadFinance() {
    const requestId = ++financeRequestId;
    const list = document.getElementById("finance-list");
    if (!list) return;

    const period = getFinancePeriod(document.getElementById("finance-period").value);
    const query = new URLSearchParams(period).toString();
    const metrics = ["finance-income", "finance-expense", "finance-profit"]
        .map((id) => document.getElementById(id));
    const count = document.getElementById("finance-count");

    metrics.forEach((metric) => {
        const animation = financeAnimations.get(metric);
        if (animation) cancelAnimationFrame(animation.frame);
        showSkeleton(metric, skeletonLine("skeleton-metric"));
    });
    document.getElementById("finance-pagination").hidden = true;
    showSkeleton(list, financeTableSkeleton(4));
    count.textContent = "Carregando lançamentos…";

    try {
        const response = await apiFetch(`${FINANCE_API_URL}${query ? `?${query}` : ""}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (requestId !== financeRequestId || !list.isConnected) return;

        financeEntries = data.entries || [];
        renderFinanceSummary(data.summary);
        list.removeAttribute("aria-busy");
        renderFinanceList();
    } catch (erro) {
        console.error("Erro ao carregar financeiro:", erro);
        if (requestId !== financeRequestId || !list.isConnected) return;

        financeEntries = null;
        count.textContent = "";
        list.innerHTML = '<p class="products-empty" role="alert">Não foi possível carregar o financeiro.</p>';
        metrics.forEach((metric) => { metric.textContent = "—"; });
        document.getElementById("finance-profit-card").classList.remove("is-negative");
    } finally {
        if (requestId === financeRequestId && list.isConnected) {
            list.removeAttribute("aria-busy");
            metrics.forEach((metric) => metric.removeAttribute("aria-busy"));
        }
    }
}

/* ---------- Filtros ---------- */

function initFinanceFilters() {
    // O período muda o que vem do servidor; tipo e busca só filtram a lista
    document.getElementById("finance-period").addEventListener("change", () => {
        financeCurrentPage = 1;
        loadFinance();
    });

    ["finance-type-filter", "finance-search"].forEach((id) => {
        document.getElementById(id).addEventListener("input", () => {
            financeCurrentPage = 1;
            renderFinanceList();
        });
    });
}

/* ---------- Modais: novo/editar lançamento e exclusão ---------- */

async function readFinanceError(response, fallback) {
    const data = await response.json().catch(() => null);
    return data?.erro || fallback;
}

function initFinanceModals() {
    const modal = document.getElementById("finance-modal");
    const deleteModal = document.getElementById("finance-delete-modal");
    const form = document.getElementById("finance-form");
    const list = document.getElementById("finance-list");
    const newBtn = document.getElementById("new-finance-entry");
    const confirmDelete = document.getElementById("confirm-finance-delete");

    if (!modal || !deleteModal || !form || !list || !newBtn) return;

    const title = document.getElementById("finance-modal-title");
    const typeInput = document.getElementById("finance-type");
    const descriptionInput = document.getElementById("finance-description");
    const amountInput = document.getElementById("finance-amount");
    const dateInput = document.getElementById("finance-date");
    const categoryInput = document.getElementById("finance-category");
    const paymentInput = document.getElementById("finance-payment");
    const paymentGroup = document.getElementById("finance-payment-group");

    const installmentsInput = document.getElementById("finance-installments");
    const syncInstallments = bindInstallments(paymentInput, installmentsInput);

    // Forma de pagamento só aparece para receitas
    function syncPayment() {
        const isIncome = typeInput.value === "receita";
        paymentGroup.hidden = !isIncome;
        if (!isIncome) paymentInput.value = "";
        syncInstallments();
    }

    const closeModal = (target) => { target.hidden = true; };

    // Categorias dependem do tipo. Se o lançamento já tem uma categoria
    // fora da lista (ex.: "Pedidos"), ela continua disponível na edição.
    function fillCategories(type, selected = "") {
        const options = [...FINANCE_CATEGORIES[type]];
        if (selected && !options.includes(selected)) options.unshift(selected);

        categoryInput.innerHTML = options
            .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
            .join("");

        categoryInput.value = options.includes(selected) ? selected : options[0];
    }

    // Ao trocar o tipo, só mantém a categoria escolhida se ela existir no novo tipo
    // (ex.: "Outros"); senão a de outro tipo vazaria como opção extra.
    typeInput.addEventListener("change", () => {
        const keep = FINANCE_CATEGORIES[typeInput.value].includes(categoryInput.value)
            ? categoryInput.value
            : "";

        fillCategories(typeInput.value, keep);
        syncPayment();
    });

    [modal, deleteModal].forEach((target) => {
        target.querySelectorAll("[data-close-modal]").forEach((btn) => {
            btn.addEventListener("click", () => closeModal(target));
        });

        target.addEventListener("click", (event) => {
            if (event.target === target) closeModal(target);
        });
    });

    // O document não é recriado: remove o listener da visita anterior
    if (financeEscHandler) document.removeEventListener("keydown", financeEscHandler);

    financeEscHandler = (event) => {
        if (event.key !== "Escape") return;
        [modal, deleteModal, document.getElementById("installments-modal")].filter(Boolean).forEach(closeModal);
    };
    document.addEventListener("keydown", financeEscHandler);

    /* Novo lançamento */
    newBtn.addEventListener("click", () => {
        form.reset();
        delete modal.dataset.entryId;

        title.textContent = "Novo lançamento";
        typeInput.value = "despesa";
        dateInput.value = localISODate(new Date());
        fillCategories("despesa");
        syncPayment();

        modal.hidden = false;
        descriptionInput.focus();
    });

    /* Editar / excluir (cliques nos botões da lista) */
    list.addEventListener("click", (event) => {
        const editBtn = event.target.closest(".finance-edit");
        const deleteBtn = event.target.closest(".finance-delete");

        if (editBtn) {
            const entry = financeEntries.find((e) => String(e.id) === editBtn.dataset.id);
            if (!entry) return;

            modal.dataset.entryId = entry.id;
            title.textContent = "Editar lançamento";

            typeInput.value = entry.type;
            descriptionInput.value = entry.description;
            amountInput.value = entry.amount;
            dateInput.value = entry.entry_date;
            fillCategories(entry.type, entry.category);
            paymentInput.value = entry.payment_method ?? "";
            syncPayment();
            installmentsInput.value = entry.installments || 1;

            modal.hidden = false;
            descriptionInput.focus();
        }

        if (deleteBtn) {
            deleteModal.dataset.entryId = deleteBtn.dataset.id;
            deleteModal.hidden = false;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const id = modal.dataset.entryId;

        const body = {
            type: typeInput.value,
            description: descriptionInput.value.trim(),
            amount: Number(amountInput.value),
            entry_date: dateInput.value,
            category: categoryInput.value,
            payment_method: typeInput.value === "receita" ? (paymentInput.value || null) : null,
            installments: typeInput.value === "receita" && paymentInput.value === "credito"
                ? Number(installmentsInput.value) || null
                : null,
        };

        submitBtn.disabled = true;

        try {
            const response = await apiFetch(id ? `${FINANCE_API_URL}/${id}` : FINANCE_API_URL, {
                method: id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(await readFinanceError(response, `HTTP ${response.status}`));
            }

            closeModal(modal);
            await loadFinance();
        } catch (erro) {
            console.error("Erro ao salvar lançamento:", erro);
            alert(`Não foi possível salvar o lançamento. ${erro.message}`);
        } finally {
            submitBtn.disabled = false;
        }
    });

    confirmDelete.addEventListener("click", async () => {
        const id = deleteModal.dataset.entryId;
        if (!id) return;

        confirmDelete.disabled = true;

        try {
            const response = await apiFetch(`${FINANCE_API_URL}/${id}`, { method: "DELETE" });

            if (!response.ok) {
                throw new Error(await readFinanceError(response, `HTTP ${response.status}`));
            }

            closeModal(deleteModal);
            await loadFinance();
        } catch (erro) {
            console.error("Erro ao excluir lançamento:", erro);
            alert(`Não foi possível excluir o lançamento. ${erro.message}`);
        } finally {
            confirmDelete.disabled = false;
        }
    });
}

/* ============================================================
   Inicialização da página de Financeiro
   (chamada no fim de financePage(), em pages.js)
   ============================================================ */
let financeInstallmentOrders = [];
let financeInstallmentOrdersRequestId = 0;
let installmentDetailsRequestId = 0;

// Situação das parcelas: pago (todas), parcial (algumas) ou pendente (nenhuma)
function installmentBadge(paid, total) {
    const state = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
    const label = state === 'paid' ? 'Pago' : state === 'partial' ? `Parcial · ${paid}/${total}` : 'Pendente';
    return `<span class="pay-badge" data-state="${state}">${label}</span>`;
}

async function loadFinanceInstallmentOrders(quiet = false) {
    const container = document.getElementById('finance-order-installments');
    if (!container) return;

    const requestId = ++financeInstallmentOrdersRequestId;
    if (!quiet) showSkeleton(container, financeTableSkeleton(3));
    try {
        const response = await apiFetch(ORDERS_API_URL);
        if (!response.ok) throw new Error('Não foi possível carregar os pedidos parcelados.');
        const orders = await response.json();
        if (requestId !== financeInstallmentOrdersRequestId || !container.isConnected) return;
        const installmentOrders = orders.filter(order => order.payment_method === 'credito');

        // Quantas parcelas de cada pedido já foram pagas
        await Promise.all(installmentOrders.map(async (order) => {
            order.installmentsTotal = Number(order.installments) || 1;
            order.installmentsPaid = 0;
            try {
                const r = await apiFetch(`${ORDERS_API_URL}/${order.id}/installments`);
                if (!r.ok) return;
                const data = await r.json();
                order.installmentsTotal = data.installments.length;
                order.installmentsPaid = data.installments.filter(p => p.paid_at).length;
            } catch (_) { /* mantém 0 pagas */ }
        }));
        if (requestId !== financeInstallmentOrdersRequestId || !container.isConnected) return;

        financeInstallmentOrders = installmentOrders;
        container.innerHTML = financeInstallmentOrders.length ? '<div class="table-wrapper"><table class="products-table table-cards installments-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Parcelas pagas</th><th>Total</th><th>Parcelas</th><th></th></tr></thead><tbody>' + financeInstallmentOrders.map(order =>
            '<tr><td data-label="Pedido">' + formatOrderNumber(order.number) + '</td><td class="cell-title">' + escapeHtml(order.customer) + '</td><td class="cell-amount">' + installmentBadge(order.installmentsPaid, order.installmentsTotal) + '</td><td data-label="Total">' + formatMoney(order.price) + '</td><td data-label="Parcelas">' + order.installmentsTotal + 'x</td><td class="cell-actions"><button type="button" class="order-installments-btn btn-cancel" data-id="' + order.id + '">Gerenciar parcelas</button></td></tr>'
        ).join('') + '</tbody></table></div>' : '<p class="products-empty">Nenhum pedido no crédito encontrado.</p>';
    } catch (error) {
        if (requestId === financeInstallmentOrdersRequestId && container.isConnected) {
            container.textContent = error.message;
        }
    } finally {
        if (requestId === financeInstallmentOrdersRequestId && container.isConnected) {
            container.removeAttribute("aria-busy");
        }
    }
}
function initFinanceInstallments() {
    const board = document.getElementById('finance-order-installments');
    if (!board) return;
    board.addEventListener('click', async (event) => {
        const btn = event.target.closest('.order-installments-btn');
        if (!btn) return;
        event.stopPropagation();
        const modal = document.getElementById('installments-modal');
        const list = document.getElementById('installments-list');
        const id = btn.dataset.id;
        const order = financeInstallmentOrders.find(o => String(o.id) === String(id));
        let saving = false;
        modal.querySelector('h2').textContent = `Parcelas do pedido ${formatOrderNumber(order.number)}`;
        modal.querySelector('.modal-header p').textContent = `${order.customer} · ${order.product}`;
        modal.hidden = false;
        const refresh = async () => {
            if (modal.hidden || !list.isConnected) return;

            const requestId = ++installmentDetailsRequestId;
            const row = `<div class="installment-row" aria-hidden="true">
                ${skeletonLine("skeleton-short")}
                ${skeletonLine("skeleton-short")}
            </div>`;

            showSkeleton(list, row.repeat(3));
            try {
                const response = await apiFetch(`${ORDERS_API_URL}/${id}/installments`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.erro || 'Erro ao carregar');
                if (requestId !== installmentDetailsRequestId || !list.isConnected) return;

                const paid = data.installments.filter(p => p.paid_at);
                const received = paid.reduce((v,p) => v + p.amount, 0);
                const total = data.installments.length;
                const pending = Math.max(0, Number(order.price || 0) - received);
                const pct = total ? Math.round((paid.length / total) * 100) : 0;
                list.innerHTML = `<div class="inst-summary">
                        <div class="inst-stats">
                            <div><span>Recebido</span><strong class="is-paid">${formatPrice(received)}</strong></div>
                            <div><span>Pendente</span><strong>${formatPrice(pending)}</strong></div>
                            <div><span>Parcelas pagas</span><strong>${paid.length}/${total}</strong></div>
                        </div>
                        <div class="inst-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>
                    </div>` +
                    data.installments.map(p => `<div class="installment-row${p.paid_at ? ' is-paid' : ''}">
                        <label class="inst-check">
                            <input type="checkbox" data-number="${p.number}" ${p.paid_at ? 'checked' : ''}>
                            <span class="inst-info"><strong>${p.number}ª parcela</strong><small>${formatPrice(p.amount)}</small></span>
                            <span class="pay-badge" data-state="${p.paid_at ? 'paid' : 'pending'}">${p.paid_at ? 'Paga' : 'Pendente'}</span>
                        </label>
                        <div class="inst-date">
                            <span>${p.paid_at ? 'Pago em' : 'Data do pagamento'}</span>
                            <input type="date" data-date="${p.number}" value="${p.paid_at || localInstallmentDate()}" aria-label="Data da parcela ${p.number}">
                        </div>
                    </div>`).join('');
                lucide.createIcons();
            } catch (error) {
                if (requestId === installmentDetailsRequestId && list.isConnected) {
                    list.textContent = error.message;
                }
            } finally {
                if (requestId === installmentDetailsRequestId && list.isConnected) {
                    list.removeAttribute("aria-busy");
                }
            }
        };
        list.onchange = async (e) => {
            if (saving) return;
            const input = e.target;
            const number = input.dataset.number || input.dataset.date;
            if (!number) return;
            const checked = list.querySelector(`input[data-number="${number}"]`).checked;
            const date = list.querySelector(`input[data-date="${number}"]`).value;
            saving = true;
            list.querySelectorAll('input').forEach(el => { el.disabled = true; });
            try {
                const response = await apiFetch(`${ORDERS_API_URL}/${id}/installments/${number}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paid: checked, paid_at: date })
                });
                if (!response.ok) throw new Error((await response.json()).erro || 'Erro ao salvar');
            } catch (error) { alert(error.message); }
            await refresh();
            await loadFinance();
            loadFinanceInstallmentOrders(true);
            saving = false;
        };
        modal.querySelector('[data-close-installments]').onclick = () => { modal.hidden = true; };
        modal.onclick = e => { if (e.target === modal) modal.hidden = true; };
        await refresh();
    });
}

function initFinancePage() {
    financeCurrentPage = 1;
    document.getElementById("finance-pagination").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-page-step]");
        if (!button || button.disabled) return;

        financeCurrentPage = Math.max(1, financeCurrentPage + Number(button.dataset.pageStep));
        renderFinanceList();
        document.getElementById(button.id).focus();
    });
    initFinanceInstallments();
    loadFinanceInstallmentOrders();
    initFinanceFilters();
    initFinanceModals();

    lucide.createIcons();
    loadFinance();
}