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
    if (!list) return;

    const type = document.getElementById("finance-type-filter").value;
    const term = document.getElementById("finance-search").value.toLowerCase().trim();

    const entries = financeEntries.filter((entry) => {
        const matchType = !type || entry.type === type;
        const matchTerm = !term
            || entry.description.toLowerCase().includes(term)
            || entry.category.toLowerCase().includes(term);

        return matchType && matchTerm;
    });

    if (!entries.length) {
        list.innerHTML = `<p class="products-empty">Nenhum lançamento encontrado.</p>`;
    } else {
        list.innerHTML = `
            <div class="table-wrapper">
                <table class="products-table finance-table">
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
                        ${entries.map(createFinanceRow).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    document.getElementById("finance-count").textContent =
        `${entries.length} ${entries.length === 1 ? "lançamento" : "lançamentos"}`;

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
            <td>${formatFinanceDate(entry.entry_date)}</td>
            <td>
                <span class="finance-desc" title="${escapeHtml(entry.description)}">${escapeHtml(entry.description)}</span>
                ${fromOrder
            ? `<span class="finance-auto" title="Lançado automaticamente ao concluir o pedido"><i data-lucide="zap"></i>Automático</span>`
            : ""}
            </td>
            <td>${escapeHtml(entry.category)}</td>
            <td>${isIncome && entry.payment_method ? escapeHtml(paymentDescription(entry.payment_method, entry.installments)) : "—"}</td>
            <td class="finance-amount ${isIncome ? "income" : "expense"}">
                ${isIncome ? "+" : "−"} ${formatMoney(entry.amount)}
            </td>
            <td><div class="finance-actions">${actions}</div></td>
        </tr>
    `;
}

async function loadFinance() {
    const requestId = ++financeRequestId;
    const list = document.getElementById("finance-list");
    if (!list) return;

    const period = getFinancePeriod(document.getElementById("finance-period").value);
    const query = new URLSearchParams(period).toString();

    try {
        const response = await fetch(`${FINANCE_API_URL}${query ? `?${query}` : ""}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Saiu da página ou trocou o período enquanto a resposta chegava
        if (requestId !== financeRequestId || !document.getElementById("finance-list")) return;

        financeEntries = data.entries || [];
        renderFinanceSummary(data.summary);
        renderFinanceList();
    } catch (erro) {
        console.error("Erro ao carregar financeiro:", erro);

        if (requestId === financeRequestId && document.getElementById("finance-list")) {
            document.getElementById("finance-list").innerHTML =
                `<p class="products-empty">Não foi possível carregar o financeiro.</p>`;
        }
    }
}

/* ---------- Filtros ---------- */

function initFinanceFilters() {
    // O período muda o que vem do servidor; tipo e busca só filtram a lista
    document.getElementById("finance-period").addEventListener("change", loadFinance);

    ["finance-type-filter", "finance-search"].forEach((id) => {
        document.getElementById(id).addEventListener("input", renderFinanceList);
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
        [modal, deleteModal].forEach(closeModal);
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
            const response = await fetch(id ? `${FINANCE_API_URL}/${id}` : FINANCE_API_URL, {
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
            const response = await fetch(`${FINANCE_API_URL}/${id}`, { method: "DELETE" });

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
function initFinancePage() {
    initFinanceFilters();
    initFinanceModals();

    lucide.createIcons();
    loadFinance();
}