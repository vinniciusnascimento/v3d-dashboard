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

let financeData = null;
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

function getFilteredFinanceEntries(entries) {
    const type = document.getElementById("finance-type-filter").value;
    const term = document.getElementById("finance-search").value.toLowerCase().trim();

    return entries.filter((entry) => {
        const matchType = !type || entry.type === type;
        const matchTerm = !term
            || entry.description.toLowerCase().includes(term)
            || entry.category.toLowerCase().includes(term);

        return matchType && matchTerm;
    });
}

function renderFinanceList() {
    const list = document.getElementById("finance-list");
    if (!list || list.hasAttribute("aria-busy") || !financeData) return;

    const entries = getFilteredFinanceEntries(financeData.entries);
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

        financeData = { entries: data.entries || [], summary: data.summary, period };
        renderFinanceSummary(data.summary);
        list.removeAttribute("aria-busy");
        renderFinanceList();
    } catch (erro) {
        console.error("Erro ao carregar financeiro:", erro);
        if (requestId !== financeRequestId || !list.isConnected) return;

        financeData = null;
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

/* ---------- Exportação em PDF ---------- */

async function buildFinancePdf(entries, summary, period) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.setTitle("Financeiro | V3D");
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const contentWidth = pageWidth - 2 * margin;
    const bottom = pageHeight - margin - 20;
    const columnEdges = [margin, 99, 291, 377, 461, pageWidth - margin];
    const labels = ["Data", "Descrição", "Categoria", "Pagamento", "Valor"];
    const ink = rgb(0.063, 0.071, 0.063);
    const muted = rgb(0.357, 0.392, 0.345);
    const green = rgb(0, 0.149, 0.051);
    const greenSoft = rgb(0.890, 0.961, 0.800);
    const paper = rgb(0.965, 0.969, 0.945);
    const white = rgb(1, 1, 1);
    const charset = new Set(regular.getCharacterSet());
    const rangeLabel = period.from
        ? `${formatFinanceDate(period.from)} a ${formatFinanceDate(period.to)}`
        : "Todo o período";

    function drawText(page, text, x, top, { font = regular, size = 9, color = ink, right = false } = {}) {
        page.drawText(text, {
            x: right ? x - font.widthOfTextAtSize(text, size) : x,
            y: pageHeight - top - size,
            font,
            size,
            color,
        });
    }

    function drawBox(page, x, top, width, height, color) {
        page.drawRectangle({ x, y: pageHeight - top - height, width, height, color });
    }

    function wrapCell(value, width) {
        // As fontes padrão do PDF cobrem os acentos em português, mas não todo o Unicode.
        const normalized = String(value ?? "").normalize("NFC")
            .replace(/\s+/g, " ").replace(/[‐-―−]/g, "-").trim();
        let remaining = Array.from(normalized, (char) => charset.has(char.codePointAt(0)) ? char : "?")
            .join("") || "-";
        const lines = [];

        while (remaining) {
            let length = 1;
            while (length < remaining.length && regular.widthOfTextAtSize(remaining.slice(0, length + 1), 9) <= width) {
                length++;
            }
            if (length < remaining.length && remaining[length] !== " ") {
                const space = remaining.lastIndexOf(" ", length - 1);
                if (space > 0) length = space;
            }
            lines.push(remaining.slice(0, length));
            remaining = remaining.slice(length).trimStart();
        }

        return lines;
    }

    function startPage(firstPage) {
        const page = pdf.addPage([pageWidth, pageHeight]);
        drawText(page, "Financeiro | V3D", margin, margin, { font: bold, size: 22, color: green });
        drawText(page, `Período: ${rangeLabel}`, margin, 67, { size: 10, color: muted });

        if (firstPage) {
            const countLabel = entries.length === 1 ? "lançamento exportado" : "lançamentos exportados";
            drawText(page, `${entries.length} ${countLabel}`, margin, 82, { color: muted });
            drawText(page, "Totais do período", margin, 106, { font: bold, size: 11 });

            const cardWidth = (contentWidth - 16) / 3;
            [
                ["Receitas", summary.receitas],
                ["Despesas", summary.despesas],
                ["Lucro", summary.lucro],
            ].forEach(([label, value], index) => {
                const x = margin + index * (cardWidth + 8);
                drawBox(page, x, 124, cardWidth, 48, greenSoft);
                drawText(page, label, x + 10, 132, { color: muted });
                drawText(page, formatMoney(value).replace(/\s/g, " "), x + 10, 146, { font: bold, size: 13 });
            });
        }

        const tableTop = firstPage ? 188 : 91;
        drawBox(page, margin, tableTop, contentWidth, 24, green);
        labels.forEach((label, index) => {
            const right = index === labels.length - 1;
            const x = right ? columnEdges[index + 1] - 8 : columnEdges[index] + 8;
            drawText(page, label, x, tableTop + 7, { font: bold, color: white, right });
        });

        return { page, top: tableTop + 24 };
    }

    let { page, top } = startPage(true);
    entries.forEach((entry, rowIndex) => {
        const isIncome = entry.type === "receita";
        const cells = [
            formatFinanceDate(entry.entry_date),
            entry.description,
            entry.category,
            isIncome ? paymentDescription(entry.payment_method, entry.installments) : "-",
            `${isIncome ? "+" : "-"} ${formatMoney(entry.amount)}`,
        ].map((value, index) => wrapCell(value, columnEdges[index + 1] - columnEdges[index] - 16));
        const rowHeight = Math.max(...cells.map((lines) => lines.length)) * 12 + 12;

        if (top + rowHeight > bottom) {
            ({ page, top } = startPage(false));
        }
        if (rowIndex % 2 === 0) drawBox(page, margin, top, contentWidth, rowHeight, paper);

        cells.forEach((lines, index) => {
            const right = index === cells.length - 1;
            const x = right ? columnEdges[index + 1] - 8 : columnEdges[index] + 8;
            lines.forEach((line, lineIndex) => {
                drawText(page, line, x, top + 6 + lineIndex * 12, { right });
            });
        });
        top += rowHeight;
    });

    const pages = pdf.getPages();
    pages.forEach((page, index) => {
        drawText(page, `Página ${index + 1} de ${pages.length}`, pageWidth - margin, pageHeight - margin, {
            color: muted,
            right: true,
        });
    });

    return pdf.save();
}

async function exportFinancePdf(event) {
    const button = event.currentTarget;
    const list = document.getElementById("finance-list");
    if (list.hasAttribute("aria-busy")) {
        alert("Aguarde o carregamento dos lançamentos para exportar o PDF.");
        return;
    }

    button.disabled = true;
    try {
        if (!financeData) throw new Error("Dados do Financeiro indisponíveis.");

        const { entries, summary, period } = financeData;
        const filteredEntries = getFilteredFinanceEntries(entries);
        if (!filteredEntries.length) {
            alert("Nenhum lançamento corresponde aos filtros ativos para exportar.");
            return;
        }
        if (!window.PDFLib) throw new Error("Biblioteca PDF indisponível.");

        const bytes = await buildFinancePdf(filteredEntries, summary, period);
        const anchor = document.createElement("a");
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        try {
            anchor.href = url;
            anchor.download = `financeiro-v3d-${localISODate(new Date())}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
        } finally {
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
    } catch (error) {
        console.error("Erro ao exportar financeiro:", error);
        alert("Não foi possível gerar o PDF do Financeiro. Tente novamente.");
    } finally {
        button.disabled = false;
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

function installmentBadge(summary) {
    if (!summary) return '—';

    const paid = summary.installments.length;
    const state = !paid ? 'pending' : summary.pending === 0 ? 'paid' : 'partial';
    const label = state === 'paid' ? 'Concluído' : paid;
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

        await Promise.all(installmentOrders.map(async (order) => {
            try {
                const response = await apiFetch(`${ORDERS_API_URL}/${order.id}/installments`);
                if (response.ok) order.installmentSummary = await response.json();
            } catch {
                // Mantém o pedido disponível para tentar carregar as parcelas pelo modal.
            }
        }));
        if (requestId !== financeInstallmentOrdersRequestId || !container.isConnected) return;

        financeInstallmentOrders = installmentOrders;
        container.innerHTML = financeInstallmentOrders.length ? '<div class="table-wrapper"><table class="products-table table-cards installments-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Parcelas pagas</th><th>Total</th><th>Parcelas previstas</th><th></th></tr></thead><tbody>' + financeInstallmentOrders.map(order =>
            '<tr><td data-label="Pedido">' + formatOrderNumber(order.number) + '</td><td class="cell-title">' + escapeHtml(order.customer) + '</td><td class="cell-amount">' + installmentBadge(order.installmentSummary) + '</td><td data-label="Total">' + formatMoney(order.price) + '</td><td data-label="Parcelas previstas">' + (Number(order.installments) || 1) + 'x</td><td class="cell-actions"><button type="button" class="order-installments-btn btn-cancel" data-id="' + order.id + '">Gerenciar parcelas</button></td></tr>'
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
function renderInstallmentPayments(list, summary) {
    const { installments, received, pending, total } = summary;
    const progress = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
    list.innerHTML = `
        <div class="inst-summary">
            <div class="inst-stats">
                <div><span>Recebido</span><strong class="is-paid">${formatMoney(received)}</strong></div>
                <div><span>Pendente</span><strong>${formatMoney(pending)}</strong></div>
                <div><span>Parcelas pagas</span><strong>${installments.length}</strong></div>
            </div>
            <div class="inst-progress" role="progressbar" aria-label="Percentual do pedido recebido"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div style="width:${progress}%"></div></div>
        </div>
        <div class="installment-toolbar">
            <button type="button" class="btn-primary" data-create-installment ${pending > 0 ? '' : 'disabled'}>
                Criar parcela
            </button>
            ${total <= 0 ? '<p>Informe o valor do pedido para criar parcelas.</p>' : ''}
        </div>
        <form id="installment-form" class="installment-form" hidden>
            <div class="form-grid">
                <div class="form-group">
                    <label for="installment-amount">Valor pago (R$)</label>
                    <input type="number" id="installment-amount" name="amount" min="0.01" step="0.01" inputmode="decimal" required>
                </div>
                <div class="form-group">
                    <label for="installment-paid-at">Data do pagamento</label>
                    <input type="date" id="installment-paid-at" name="paid_at" required>
                </div>
            </div>
            <p class="auth-status" role="alert" hidden></p>
            <div class="installment-actions">
                <button type="button" class="btn-danger" data-remove-installment hidden>Remover parcela</button>
                <button type="button" class="btn-cancel" data-cancel-installment>Cancelar</button>
                <button type="submit" class="btn-primary">Salvar parcela</button>
            </div>
        </form>
        ${installments.map(({ number, amount, paid_at }) => `
            <div class="installment-row">
                <div class="inst-info">
                    <strong>${number}ª parcela · ${formatMoney(amount)}</strong>
                    <small>Pago em ${formatFinanceDate(paid_at)}</small>
                </div>
                <button type="button" class="btn-cancel" data-edit-installment="${number}"
                    aria-label="Editar parcela ${number}">Editar</button>
            </div>`).join('') || '<p class="installments-empty">Nenhuma parcela registrada.</p>'}
    `;
}

function initFinanceInstallments() {
    const board = document.getElementById('finance-order-installments');
    const modal = document.getElementById('installments-modal');
    const list = document.getElementById('installments-list');
    let session = 0;

    function close() { modal.hidden = true; }
    modal.querySelector('[data-close-installments]').onclick = close;
    modal.onclick = (event) => { if (event.target === modal) close(); };

    board.addEventListener('click', async (event) => {
        const button = event.target.closest('.order-installments-btn');
        if (!button) return;

        const order = financeInstallmentOrders.find(({ id }) => String(id) === button.dataset.id);
        if (!order) return;

        const current = ++session;
        const isOpen = () => current === session && !modal.hidden && list.isConnected;
        const url = `${ORDERS_API_URL}/${order.id}/installments`;
        let summary;
        let saving = false;
        let editing = null;
        let trigger;

        modal.querySelector('h2').textContent = `Parcelas do pedido ${formatOrderNumber(order.number)}`;
        modal.querySelector('.modal-header p').textContent = `${order.customer} · ${order.product}`;
        modal.hidden = false;

        async function refresh(notice = '') {
            if (!isOpen()) return;

            const row = `<div class="installment-row" aria-hidden="true">
                ${skeletonLine("skeleton-short")}${skeletonLine("skeleton-short")}
            </div>`;
            showSkeleton(list, row.repeat(3));

            try {
                const response = await apiFetch(url);
                const data = await response.json();
                if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar as parcelas.');
                if (!isOpen()) return;

                summary = data;
                renderInstallmentPayments(list, summary);
                if (notice) {
                    const message = document.createElement('p');
                    message.className = 'auth-status';
                    message.setAttribute('role', 'alert');
                    message.textContent = notice;
                    list.prepend(message);
                }
            } catch (error) {
                if (isOpen()) list.textContent = error.message;
            } finally {
                if (current === session) list.removeAttribute('aria-busy');
            }
        }

        async function save(form, remove = false) {
            if (saving) return;

            saving = true;
            const controls = [...form.elements];
            controls.forEach((control) => { control.disabled = true; });
            const message = form.querySelector('[role="alert"]');
            message.hidden = true;

            try {
                const data = remove ? { paid: false } : {
                    paid: true,
                    number: editing?.number ?? summary.next_number,
                    amount: form.elements.amount.value,
                    paid_at: form.elements.paid_at.value
                };
                const response = await apiFetch(editing ? `${url}/${editing.number}` : url, {
                    method: editing ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (response.status === 409 || response.status === 404) {
                    const error = await readFinanceError(response, 'Não foi possível salvar a parcela.');
                    await refresh(error);
                    loadFinanceInstallmentOrders(true);
                    return;
                }
                if (!response.ok) throw new Error(await readFinanceError(response, 'Não foi possível salvar a parcela.'));

                await refresh();
                if (board.isConnected) {
                    loadFinance();
                    loadFinanceInstallmentOrders(true);
                }
            } catch (error) {
                if (isOpen()) {
                    message.textContent = error.message;
                    message.hidden = false;
                }
            } finally {
                saving = false;
                controls.forEach((control) => { control.disabled = false; });
            }
        }

        list.onclick = (event) => {
            const action = event.target.closest('button');
            const form = list.querySelector('#installment-form');
            if (!action || !form || saving) return;

            if (action.matches('[data-cancel-installment]')) {
                form.hidden = true;
                trigger.focus();
            } else if (action.matches('[data-remove-installment]')) {
                save(form, true);
            } else if (action.matches('[data-create-installment], [data-edit-installment]')) {
                trigger = action;
                editing = summary.installments.find(({ number }) => number === Number(action.dataset.editInstallment));
                const amount = form.elements.amount;
                amount.value = editing?.amount ?? '';
                amount.max = (summary.pending + (editing?.amount ?? 0)).toFixed(2);
                form.elements.paid_at.value = editing?.paid_at ?? localInstallmentDate();
                form.querySelector('[data-remove-installment]').hidden = !editing;
                form.querySelector('[role="alert"]').hidden = true;
                form.hidden = false;
                amount.focus();
            }
        };

        list.onsubmit = (event) => {
            event.preventDefault();
            save(event.target);
        };

        await refresh();
    });
}

function initFinancePage() {
    financeCurrentPage = 1;
    document.getElementById("finance-export-pdf").addEventListener("click", exportFinancePdf);
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
