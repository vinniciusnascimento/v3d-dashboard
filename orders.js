/* ============================================================
   Pedidos: quadro Kanban
   Depende de: app.js (escapeHtml, formatPrice, API_URL) e lucide
   ============================================================ */

const ORDERS_API_URL = "/api/orders";

let allOrders = [];
let ordersRequestId = 0;
let draggedCard = null;
let dropped = false;
let ordersEscHandler = null;

/* ---------- Utilitários ---------- */

function formatOrderNumber(number) {
    return `#${String(number).padStart(3, "0")}`;
}

// O MySQL devolve DATE como "2026-11-20T00:00:00.000Z".
// Usar só "YYYY-MM-DD" evita o dia aparecer um a menos por causa do fuso (UTC-3).
function parseDeadline(value) {
    if (!value) return null;

    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function formatDeadline(date) {
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function isOverdue(order) {
    const deadline = parseDeadline(order.deadline);
    if (!deadline || order.status === "concluido") return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return deadline < today;
}

/* ---------- Etapas ---------- */

const ORDER_STATUSES = [
    { value: "aguardando", label: "Aguardando" },
    { value: "imprimindo", label: "Imprimindo" },
    { value: "finalizacao", label: "Finalização" },
    { value: "concluido", label: "Concluído" },
];

/* ---------- Forma de pagamento ---------- */

const PAYMENT_METHODS = [
    { value: "pix", label: "Pix" },
    { value: "credito", label: "Cartão de crédito" },
    { value: "debito", label: "Cartão de débito" },
    { value: "dinheiro", label: "Dinheiro" },
];

function paymentLabel(value) {
    const method = PAYMENT_METHODS.find((m) => m.value === value);
    return method ? method.label : "";
}

// "Cartão de crédito em 3x" (parcelas só contam no crédito)
function paymentDescription(method, installments) {
    const label = paymentLabel(method);
    const count = Number(installments);

    return label && method === "credito" && count > 1 ? `${label} em ${count}x` : label;
}

// Mostra o campo "Parcelas" só quando a forma de pagamento é cartão de crédito.
// Devolve a função de sincronização (chame depois de preencher o formulário por código).
function bindInstallments(paymentSelect, installmentsSelect) {
    const group = installmentsSelect.closest(".form-group");

    const sync = () => {
        const show = paymentSelect.value === "credito";
        group.hidden = !show;
        if (!show) installmentsSelect.value = "1";
    };

    paymentSelect.addEventListener("change", sync);
    sync();

    return sync;
}

/* ---------- Card ---------- */

function createOrderCard(order, isNew = false) {
    const deadline = parseDeadline(order.deadline);
    const overdue = isOverdue(order);
    const quantity = Number(order.quantity) || 1;
    const items = orderItemsOf(order);

    return `
        <article class="order-card${isNew ? " is-new" : ""}" draggable="true" data-id="${order.id}">
            <div class="order-card-top">
                <span class="order-number">${formatOrderNumber(order.number)}</span>
                <div class="order-card-actions">
                    <button type="button" class="order-edit" data-id="${order.id}" aria-label="Editar pedido" title="Editar pedido">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button type="button" class="order-delete" data-id="${order.id}" aria-label="Excluir pedido" title="Excluir pedido">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>

            <h3 class="order-customer">${escapeHtml(order.customer)}</h3>

            <p class="order-product">
                <i data-lucide="package"></i>
                <span>${items.map(item => `${Number(item.quantity)}× ${escapeHtml(item.name)}`).join("<br>")}</span>
            </p>

            ${order.notes ? `<p class="order-notes">${escapeHtml(order.notes)}</p>` : ""}

            <div class="order-meta">
                ${deadline
            ? `<span class="order-deadline${overdue ? " overdue" : ""}" title="${overdue ? "Prazo vencido" : "Prazo de entrega"}">
                            <i data-lucide="${overdue ? "alarm-clock" : "calendar"}"></i>${formatDeadline(deadline)}
                       </span>`
            : `<span class="order-deadline"><i data-lucide="calendar"></i>Sem prazo</span>`}
                <span class="order-price">${formatPrice(order.price)}</span>
            </div>

            <label class="order-move">
                <span>Mover para</span>
                <select class="order-status-select" data-id="${order.id}" aria-label="Mover pedido ${formatOrderNumber(order.number)} para outra etapa">
                    ${ORDER_STATUSES.map((s) =>
                `<option value="${s.value}"${s.value === order.status ? " selected" : ""}>${s.label}</option>`
            ).join("")}
                </select>
            </label>
        </article>
    `;
}

/* ---------- Renderização ---------- */

function updateOrderCounts() {
    document.querySelectorAll(".order-column").forEach((column) => {
        column.querySelector(".column-count").textContent =
            column.querySelectorAll(".order-card").length;
    });
}

function renderOrders(newId = null) {
    document.querySelectorAll(".order-list").forEach((list) => {
        const status = list.dataset.status;

        const cards = allOrders
            .filter((order) => order.status === status)
            .sort((a, b) => a.position - b.position);

        // Sem espaços/quebras: o CSS usa :empty para mostrar "Nenhum pedido"
        list.innerHTML = cards
            .map((order) => createOrderCard(order, String(order.id) === String(newId)))
            .join("");
    });

    updateOrderCounts();
    lucide.createIcons();
}

async function loadOrders(newId = null, showLoading = false) {
    const board = document.getElementById("orders-board");
    if (!board) return;

    const requestId = ++ordersRequestId;
    if (showLoading) {
        board.setAttribute("aria-busy", "true");
        const card = `
            <div class="skeleton-order" aria-hidden="true">
                ${skeletonLine("skeleton-short")}
                ${skeletonLine("skeleton-medium")}
                ${skeletonLine()}
                ${skeletonLine("skeleton-medium")}
            </div>`;

        board.querySelectorAll(".column-count").forEach((count) => {
            count.innerHTML = skeletonLine("skeleton-count");
        });
        board.querySelectorAll(".order-list").forEach((list) => {
            list.innerHTML = card;
        });
    }

    try {
        const response = await apiFetch(ORDERS_API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (requestId !== ordersRequestId || !board.isConnected) return;

        allOrders = Array.isArray(data) ? data : (data.pedidos || data.data || []);
        renderOrders(newId);
    } catch (erro) {
        console.error("Erro ao carregar pedidos:", erro);
        if (requestId !== ordersRequestId || !board.isConnected) return;

        if (board.hasAttribute("aria-busy")) {
            board.querySelectorAll(".column-count").forEach((count) => { count.textContent = "—"; });
            board.querySelectorAll(".order-list").forEach((list) => {
                list.innerHTML = '<p class="products-empty">Pedidos indisponíveis.</p>';
            });
        }
        alert("Não foi possível carregar os pedidos.");
    } finally {
        if (requestId === ordersRequestId && board.isConnected) board.removeAttribute("aria-busy");
    }
}

/* ---------- Seletor de produtos (Product Picker) ---------- */

let pickerProducts = [];
let pickerOutsideHandler = null;

function productImageSrc(p) {
    if (p.has_image) return `${API_URL}/${p.id}/imagem`;
    if (p.image) return IMAGES_PATH + p.image;
    return null;
}

// Editor de múltiplos itens reutilizado nos modais de criação e edição.
const itemEditors = {};
function orderItemsOf(order) {
    return Array.isArray(order.items) && order.items.length ? order.items : [{
        name: order.product, quantity: Number(order.quantity) || 1,
        unit_price: order.price == null ? null : Number(order.price) / (Number(order.quantity) || 1),
        product_id: null
    }];
}
function initItemsEditor(prefix) {
    const id = (part) => `${prefix}${part}`;
    const input = document.getElementById(id('order-product'));
    const qty = document.getElementById(id('order-quantity'));
    const unitPrice = document.getElementById(id('order-unit-price'));
    const addBtn = document.getElementById(id('order-add-product'));
    const list = document.getElementById(id('order-items'));
    const total = document.getElementById(id('order-price'));
    const panel = document.getElementById(prefix ? 'edit-picker-panel' : 'picker-panel');
    const grid = document.getElementById(prefix ? 'edit-picker-grid' : 'picker-grid');
    const picker = document.getElementById(prefix ? 'edit-product-picker' : 'product-picker');
    if (!input || !list || !panel) return null;
    let items = [], selectedProduct = null;
    function render() {
        list.innerHTML = items.map((item, index) => `<div class="order-item-row" data-index="${index}">
            <div class="order-item-name">${escapeHtml(item.name)}</div>
            <label>Qtd.<input class="item-qty" type="number" min="1" step="1" value="${item.quantity}" aria-label="Quantidade de ${escapeHtml(item.name)}"></label>
            <label>Un. (R$)<input class="item-price" type="number" min="0" step="0.01" value="${item.unit_price ?? ''}" placeholder="A definir" aria-label="Preço de ${escapeHtml(item.name)}"></label>
            <span class="order-item-subtotal">${item.unit_price == null ? 'A definir' : formatPrice(Math.round(item.unit_price * 100) * item.quantity / 100)}</span>
            <button class="order-item-remove" type="button" aria-label="Remover ${escapeHtml(item.name)}" title="Remover"><i data-lucide="trash-2"></i></button>
        </div>`).join('') || '<p class="picker-empty">Adicione pelo menos um produto.</p>';
        const complete = items.every(item => item.unit_price !== null);
        total.value = items.length && complete ? (items.reduce((acc, item) => acc + Math.round(item.unit_price * 100) * item.quantity, 0) / 100).toFixed(2) : '';
        lucide.createIcons();
    }
    function add() {
        const name = input.value.trim();
        const quantity = Number(qty.value);
        const price = unitPrice.value === '' ? null : Number(unitPrice.value);
        if (!name || !Number.isInteger(quantity) || quantity < 1 || (price !== null && (!Number.isFinite(price) || price < 0))) {
            alert('Informe produto, quantidade válida e preço unitário não negativo.'); return false;
        }
        items.push({ name, quantity, unit_price: price, product_id: selectedProduct?.id ?? null });
        input.value = ''; qty.value = '1'; unitPrice.value = ''; selectedProduct = null;
        panel.hidden = true; render(); input.focus(); return true;
    }
    addBtn.addEventListener('click', add);
    input.addEventListener('input', () => { selectedProduct = null; showPicker(); });
    input.addEventListener('focus', showPicker);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add(); } });
    function showPicker() {
        const term = input.value.toLowerCase().trim();
        const products = pickerProducts.filter(p => (p.name || '').toLowerCase().includes(term));
        grid.innerHTML = products.length ? products.map(p => {
            const src = productImageSrc(p);
            return `<button type="button" class="picker-card" data-id="${p.id}">
                <span class="picker-card-image">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">` : '<i data-lucide="image"></i>'}</span>
                <span class="picker-card-name">${escapeHtml(p.name)}</span>
                <span class="picker-card-price">${formatPrice(p.price)}</span></button>`;
        }).join('') : '<p class="picker-empty">Nenhum produto encontrado. Você pode digitar um nome e adicionar.</p>';
        panel.hidden = false; lucide.createIcons();
    }
    grid.addEventListener('click', event => {
        const card = event.target.closest('.picker-card'); if (!card) return;
        const product = pickerProducts.find(p => String(p.id) === card.dataset.id); if (!product) return;
        input.value = product.name; unitPrice.value = product.price == null ? '' : Number(product.price).toFixed(2);
        selectedProduct = product; panel.hidden = true; qty.focus();
    });
    document.addEventListener('click', event => { if (picker.isConnected && !picker.contains(event.target)) panel.hidden = true; });
    list.addEventListener('click', event => {
        const btn = event.target.closest('.order-item-remove'); if (!btn) return;
        items.splice(Number(btn.closest('.order-item-row').dataset.index), 1); render();
    });
    list.addEventListener('change', event => {
        const row = event.target.closest('.order-item-row'); if (!row) return;
        const item = items[Number(row.dataset.index)];
        if (event.target.classList.contains('item-qty')) {
            const value = Number(event.target.value);
            if (!Number.isInteger(value) || value < 1) { alert('Quantidade deve ser maior que zero.'); render(); return; }
            item.quantity = value;
        } else if (event.target.classList.contains('item-price')) {
            const value = event.target.value === '' ? null : Number(event.target.value);
            if (value !== null && (!Number.isFinite(value) || value < 0)) { alert('Preço inválido.'); render(); return; }
            item.unit_price = value;
        }
        render();
    });
    const editor = {
        reset() { items = []; input.value = ''; qty.value = 1; unitPrice.value = ''; selectedProduct = null; panel.hidden = true; render(); },
        set(data) {
            items = data.map(item => ({
                name: item.name || item.product_name, quantity: Number(item.quantity) || 1,
                unit_price: item.unit_price == null ? null : Number(item.unit_price), product_id: item.product_id ?? null
            })); render();
        },
        get() { return items.map(item => ({ ...item })); }
    };
    itemEditors[prefix || 'new'] = editor;
    render(); return editor;
}
function initProductPicker() { return initItemsEditor(''); }

// Busca o catálogo e prepara o seletor
async function loadProductSuggestions() {
    try {
        let produtos = allProducts ?? [];

        if (!produtos.length) {
            const response = await apiFetch(API_URL);
            if (!response.ok) return;

            const data = await response.json();
            produtos = Array.isArray(data) ? data : (data.produtos || data.data || []);
        }

        pickerProducts = produtos;
    } catch (erro) {
        console.error("Erro ao carregar produtos para o seletor:", erro);
    }
}

/* ---------- Arrastar e soltar ---------- */

// Descobre antes de qual card o item arrastado deve entrar
function getDragAfterElement(list, y) {
    const cards = [...list.querySelectorAll(".order-card:not(.dragging)")];

    return cards.reduce((closest, card) => {
        const box = card.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);

        return offset < 0 && offset > closest.offset
            ? { offset, element: card }
            : closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

async function persistColumn(list) {
    const status = list.dataset.status;
    const ids = [...list.querySelectorAll(".order-card")].map((card) => Number(card.dataset.id));

    // Atualiza a lista local
    ids.forEach((id, index) => {
        const order = allOrders.find((o) => Number(o.id) === id);
        if (order) {
            order.status = status;
            order.position = index;
        }
    });

    try {
        const response = await apiFetch(`${ORDERS_API_URL}/reordenar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, ids }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (erro) {
        console.error("Erro ao mover pedido:", erro);
        alert("Não foi possível mover o pedido.");
        loadOrders(); // volta ao estado salvo no banco
    }
}

/* ---------- Mover pelo seletor do card ---------- */

async function moveOrderToStatus(id, newStatus) {
    const order = allOrders.find((o) => String(o.id) === String(id));
    if (!order || order.status === newStatus) return;

    // O pedido entra no fim da coluna de destino
    const destination = allOrders
        .filter((o) => o.status === newStatus && o !== order)
        .sort((a, b) => a.position - b.position);

    order.status = newStatus;
    order.position = destination.length;

    const ids = [...destination.map((o) => Number(o.id)), Number(order.id)];

    renderOrders();

    try {
        const response = await apiFetch(`${ORDERS_API_URL}/reordenar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, ids }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (erro) {
        console.error("Erro ao mover pedido:", erro);
        alert("Não foi possível mover o pedido.");
        loadOrders(); // volta ao estado salvo no banco
    }
}

function initOrderStatusSelect() {
    const board = document.getElementById("orders-board");
    if (!board) return;

    board.addEventListener("change", (event) => {
        const select = event.target.closest(".order-status-select");
        if (!select) return;

        moveOrderToStatus(select.dataset.id, select.value);
    });
}

function initOrdersDragAndDrop() {
    const board = document.getElementById("orders-board");
    if (!board) return;

    board.addEventListener("dragstart", (event) => {
        const card = event.target.closest(".order-card");
        if (!card) return;

        draggedCard = card;
        dropped = false;

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.id); // necessário no Firefox

        // Adia a classe para o navegador capturar a imagem do card antes de esmaecer
        requestAnimationFrame(() => card.classList.add("dragging"));
    });

    board.addEventListener("dragend", () => {
        if (!draggedCard) return;

        draggedCard.classList.remove("dragging");
        board.querySelectorAll(".drag-over").forEach((c) => c.classList.remove("drag-over"));

        // Soltou fora de uma coluna: desfaz o movimento visual
        if (!dropped) renderOrders();

        draggedCard = null;
    });

    board.addEventListener("dragover", (event) => {
        const column = event.target.closest(".order-column");
        if (!column || !draggedCard) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        board.querySelectorAll(".drag-over").forEach((c) => {
            if (c !== column) c.classList.remove("drag-over");
        });
        column.classList.add("drag-over");

        const list = column.querySelector(".order-list");
        const after = getDragAfterElement(list, event.clientY);

        if (after) list.insertBefore(draggedCard, after);
        else list.appendChild(draggedCard);

        updateOrderCounts();
    });

    board.addEventListener("dragleave", (event) => {
        const column = event.target.closest(".order-column");
        if (column && !column.contains(event.relatedTarget)) {
            column.classList.remove("drag-over");
        }
    });

    board.addEventListener("drop", (event) => {
        const column = event.target.closest(".order-column");
        if (!column || !draggedCard) return;

        event.preventDefault();
        dropped = true;
        column.classList.remove("drag-over");

        persistColumn(column.querySelector(".order-list"));
    });
}

/* ---------- Proposta comercial: PDF desenhado em código (identidade V3D) ---------- */


async function exportOrderQuotePDF(order) {
    const PDFLib = window.PDFLib;

    if (!PDFLib) {
        alert("Não foi possível carregar a biblioteca PDF. Verifique a internet e tente novamente.");
        return false;
    }

    try {
        const { PDFDocument, StandardFonts, rgb } = PDFLib;
        const pdf = await PDFDocument.create();
        let page = pdf.addPage([595.28, 841.89]); // A4
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

        const W = page.getWidth();
        const H = page.getHeight();
        const M = 40;

        // Paleta V3D
        const ink = rgb(0.063, 0.071, 0.063);       // #101210
        const flagGreen = rgb(0, 0.1490, 0.0510);     // rgb(0, 38, 13)
        const lime = rgb(0.604, 0.953, 0.271);      // #9AF345
        const green = rgb(0.247, 0.490, 0.055);     // #3F7D0E
        const greenSoft = rgb(0.890, 0.961, 0.800); // #E3F5CC
        const muted = rgb(0.357, 0.392, 0.345);     // #5B6458
        const line = rgb(0.867, 0.882, 0.839);      // #DDE1D6
        const paper = rgb(0.965, 0.969, 0.945);     // #F6F7F1
        const white = rgb(1, 1, 1);

        const clean = (value, fallback = "-") =>
            String(value == null || value === "" ? fallback : value)
                .replace(/[\u0000-\u001f\u007f]/g, " ")
                .replace(/[‐-―]/g, "-")
                .replace(/[‘’]/g, "'")
                .replace(/[“”]/g, '"')
                .replace(/[^ -ÿ•]/g, "")
                .replace(/\s+/g, " ")
                .trim();

        const money = (n) =>
            n == null || n === ""
                ? "A combinar"
                : Number(n).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL"
                });

        const dateOnly = (value) => {
            if (!value) return "Não informada";

            const parts = String(value).slice(0, 10).split("-");

            return parts.length === 3
                ? `${parts[2]}/${parts[1]}/${parts[0]}`
                : clean(value);
        };

        const dateCreated = order.created_at || order.createdAt;

        const emissionDate =
            dateCreated && !Number.isNaN(new Date(dateCreated).getTime())
                ? new Date(dateCreated).toLocaleDateString("pt-BR", {
                    timeZone: "America/Maceio"
                })
                : new Date().toLocaleDateString("pt-BR");

        // Coordenadas a partir do topo da página
        const rect = (x, top, w, h, color, border) =>
            page.drawRectangle({
                x,
                y: H - top - h,
                width: w,
                height: h,
                color,
                ...(border
                    ? { borderColor: border, borderWidth: 0.8 }
                    : {})
            });

        const text = (value, x, top, opts = {}) => {
            const f = opts.bold ? bold : font;
            const maxWidth = opts.maxWidth;

            let size = opts.size || 9;
            let str = clean(value, opts.fallback);

            if (maxWidth) {
                while (
                    size > (opts.minSize || 6.5) &&
                    f.widthOfTextAtSize(str, size) > maxWidth
                ) {
                    size -= 0.25;
                }

                if (f.widthOfTextAtSize(str, size) > maxWidth) {
                    while (
                        str.length &&
                        f.widthOfTextAtSize(`${str}...`, size) > maxWidth
                    ) {
                        str = str.slice(0, -1);
                    }

                    str += "...";
                }
            }

            const w = f.widthOfTextAtSize(str, size);

            const px =
                opts.align === "right"
                    ? x - w
                    : opts.align === "center"
                        ? x - w / 2
                        : x;

            page.drawText(str, {
                x: px,
                y: H - top - size * 0.8,
                font: f,
                size,
                color: opts.color || ink
            });

            return size;
        };

        // Quebra de linha para textos longos
        const wrap = (value, size, maxWidth) => {
            const words = clean(value, "").split(" ").filter(Boolean);
            const lines = [];

            let current = "";

            words.forEach((word) => {
                const test = current ? `${current} ${word}` : word;

                if (
                    font.widthOfTextAtSize(test, size) > maxWidth &&
                    current
                ) {
                    lines.push(current);
                    current = word;
                } else {
                    current = test;
                }
            });

            if (current) lines.push(current);

            return lines;
        };

        const label = (value, x, top) =>
            text(String(value).toUpperCase(), x, top, {
                size: 7,
                bold: true,
                color: muted
            });

        // Informações do pedido
        const status =
            ORDER_STATUSES.find(
                (item) => item.value === order.status
            )?.label || "Aguardando";

        // Usa os itens da API; pedidos antigos continuam funcionando pelo fallback.
        const items = orderItemsOf(order).map(item => ({
            name: item.name || item.product_name || item.product || "Produto",
            quantity: Math.max(1, Number(item.quantity) || 1),
            unit_price: item.unit_price == null || item.unit_price === ""
                ? null : Number(item.unit_price)
        }));
        const computedTotal = items.every(item => item.unit_price !== null)
            ? items.reduce((sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity, 0) / 100
            : null;
        const total = computedTotal ?? (order.price == null || order.price === "" ? null : Number(order.price));

        const number =
            order.number != null
                ? formatOrderNumber(order.number)
                : order.id != null
                    ? `#${order.id}`
                    : "-";

        const installments =
            order.payment_method === "credito"
                ? `${Math.max(1, Number(order.installments) || 1)}x`
                : "À vista";

        /* ---------- CABEÇALHO ---------- */

        rect(0, 0, W, 128, flagGreen);
        rect(0, 128, W, 4, lime);

        // Logo oficial V3D
        const logoResponse = await fetch(
            "assets/logo-v3d-proposta.png"
        );

        if (!logoResponse.ok) {
            throw new Error(
                "Logo da proposta não encontrado em assets/logo-v3d-proposta.png"
            );
        }

        const logoBytes = await logoResponse.arrayBuffer();
        const logo = await pdf.embedPng(logoBytes);
        const logoDimensions = logo.scaleToFit(120, 114);

        page.drawImage(logo, {
            x: M,
            y: H - 7 - logoDimensions.height,
            width: logoDimensions.width,
            height: logoDimensions.height
        });

        text("PROPOSTA COMERCIAL", W - M, 42, {
            size: 15,
            bold: true,
            color: white,
            align: "right"
        });

        text(`Pedido ${number}`, W - M, 66, {
            size: 10,
            color: lime,
            bold: true,
            align: "right"
        });

        text(`Emitida em ${emissionDate}`, W - M, 82, {
            size: 9,
            color: rgb(0.62, 0.64, 0.61),
            align: "right"
        });

        /* ---------- CLIENTE ---------- */

        let y = 156;

        rect(M, y, W - M * 2, 62, paper, line);
        rect(M, y, 4, 62, green);

        label("Cliente", M + 20, y + 14);

        text(order.customer, M + 20, y + 28, {
            size: 14,
            bold: true,
            maxWidth: 300
        });

        label("Status do pedido", W - M - 150, y + 14);

        rect(
            W - M - 150,
            y + 28,
            130,
            20,
            greenSoft
        );

        text(status, W - M - 85, y + 33, {
            size: 9,
            bold: true,
            color: green,
            align: "center"
        });

        /* ---------- TABELA DE ITENS ---------- */

        y = 246;

        text("Itens da proposta", M, y, {
            size: 12,
            bold: true
        });

        const tableW = W - M * 2;
        const cols = {
            n: M + 14,
            desc: M + 48,
            qty: M + tableW - 190,
            unit: M + tableW - 105,
            total: M + tableW - 14
        };
        const th = { size: 7.5, bold: true, color: lime };
        const rowHeight = 38;
        let tableTop = y + 24;
        let rowTop = tableTop + 26;

        const drawTableHeading = () => {
            rect(M, tableTop, tableW, 26, flagGreen);
            text("ITEM", cols.n, tableTop + 9, th);
            text("DESCRIÇÃO", cols.desc, tableTop + 9, th);
            text("QTD.", cols.qty, tableTop + 9, { ...th, align: "center" });
            text("VALOR UNIT.", cols.unit, tableTop + 9, { ...th, align: "right" });
            text("TOTAL", cols.total, tableTop + 9, { ...th, align: "right" });
        };

        const nextPage = () => {
            page = pdf.addPage([W, H]);
            rect(0, 0, W, 63, flagGreen);
            rect(0, 63, W, 3, lime);
            text(`PROPOSTA COMERCIAL - Pedido ${number}`, M, 24, {
                size: 13, bold: true, color: white
            });
            return 92;
        };

        drawTableHeading();
        items.forEach((item, index) => {
            // Deixa espaço para o resumo/condições na página final.
            if (rowTop + rowHeight + 195 > H - 47) {
                const top = nextPage();
                text("Itens da proposta (continuação)", M, top, { size: 12, bold: true });
                tableTop = top + 24;
                rowTop = tableTop + 26;
                drawTableHeading();
            }
            rect(M, rowTop, tableW, rowHeight, index % 2 ? paper : white, line);
            text(String(index + 1).padStart(2, "0"), cols.n, rowTop + 14, {
                size: 9, color: muted, bold: true
            });
            text(item.name, cols.desc, rowTop + 14, {
                size: 10, bold: true, maxWidth: cols.qty - cols.desc - 30
            });
            text(item.quantity, cols.qty, rowTop + 14, { size: 10, align: "center" });
            text(money(item.unit_price), cols.unit, rowTop + 14, {
                size: 9.5, align: "right", maxWidth: 78
            });
            const subtotal = item.unit_price === null
                ? null : Math.round(item.unit_price * 100) * item.quantity / 100;
            text(money(subtotal), cols.total, rowTop + 14, {
                size: 9.5, bold: true, align: "right", maxWidth: 80
            });
            rowTop += rowHeight;
        });

        /* ---------- VALOR TOTAL ---------- */

        const totalTop = rowTop + 16;
        const boxW = 230;

        rect(
            W - M - boxW,
            totalTop,
            boxW,
            56,
            flagGreen
        );

        rect(
            W - M - boxW,
            totalTop,
            5,
            56,
            lime
        );

        text(
            "VALOR TOTAL",
            W - M - boxW + 22,
            totalTop + 12,
            {
                size: 7.5,
                bold: true,
                color: rgb(0.62, 0.64, 0.61)
            }
        );

        text(
            money(total),
            W - M - 16,
            totalTop + 27,
            {
                size: 20,
                minSize: 12,
                bold: true,
                color: lime,
                align: "right",
                maxWidth: boxW - 40
            }
        );

        /* ---------- OBSERVAÇÕES ---------- */

        let cursor = totalTop + 56;

        if (order.notes) {
            cursor += 26;
            if (cursor + 140 > H - 56) cursor = nextPage();

            text("Observações", M, cursor, {
                size: 12,
                bold: true
            });

            const lines = wrap(
                order.notes,
                9,
                W - M * 2 - 28
            ).slice(0, 5);

            const boxH = lines.length * 13 + 22;

            rect(
                M,
                cursor + 22,
                W - M * 2,
                boxH,
                paper,
                line
            );

            lines.forEach((l, i) =>
                text(
                    l,
                    M + 14,
                    cursor + 33 + i * 13,
                    {
                        size: 9,
                        color: muted
                    }
                )
            );

            cursor += 22 + boxH;
        }

        /* ---------- CONDIÇÕES COMERCIAIS ---------- */

        const terms = [
            "Alterações solicitadas após o início da produção poderão gerar custos adicionais.",
            "Peças produzidas por impressão 3D podem apresentar pequenas variações de acabamento.",
            "Esta proposta está sujeita à confirmação de disponibilidade de materiais."
        ];

        let termsTop = Math.max(cursor + 28, page === pdf.getPages()[0] ? 515 : 110);
        if (termsTop + 110 > H - 55) termsTop = nextPage();

        text("Condições comerciais", M, termsTop, {
            size: 12,
            bold: true
        });

        rect(
            M,
            termsTop + 20,
            W - M * 2,
            1,
            line
        );

        terms.forEach((term, i) => {
            rect(
                M,
                termsTop + 35 + i * 20,
                5,
                5,
                lime
            );

            text(
                term,
                M + 16,
                termsTop + 32 + i * 20,
                {
                    size: 8.5,
                    color: muted,
                    maxWidth: W - M * 2 - 16
                }
            );
        });

        /* ---------- RODAPÉ ---------- */

        pdf.getPages().forEach((pdfPage) => {
            page = pdfPage;
            rect(
                0,
                H - 44,
                W,
                44,
                flagGreen
            );

            rect(
                0,
                H - 47,
                W,
                3,
                lime
            );

            text(
                "Obrigado pela preferência!",
                M,
                H - 29,
                {
                    size: 9,
                    bold: true,
                    color: white
                }
            );

            text(
                "V3D Impressão 3D  |  site-v3d.vercel.app",
                W - M,
                H - 29,
                {
                    size: 8.5,
                    color: rgb(0.62, 0.64, 0.61),
                    align: "right"
                }
            );
        });

        /* ---------- EXPORTAR PDF ---------- */

        const pdfBytes = await pdf.save();

        const blob = new Blob(
            [pdfBytes],
            { type: "application/pdf" }
        );

        const blobUrl = URL.createObjectURL(blob);

        const anchor = document.createElement("a");

        const safeName = clean(
            order.customer,
            "cliente"
        )
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .slice(0, 45);

        anchor.href = blobUrl;

        anchor.download =
            `proposta-v3d-${number.replace(/[^0-9]/g, "") || "pedido"}-${safeName}.pdf`;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(
            () => URL.revokeObjectURL(blobUrl),
            60000
        );

        return true;

    } catch (error) {
        console.error("Erro ao exportar proposta:", error);
        alert("Não foi possível gerar a proposta.");
        return false;
    }
}


/* ---------- Modais: novo pedido e exclusão ---------- */

function initOrderModals() {
    const orderModal = document.getElementById("order-modal");
    const deleteModal = document.getElementById("order-delete-modal");
    const orderForm = document.getElementById("order-form");
    const newOrderBtn = document.getElementById("new-order");
    const confirmDelete = document.getElementById("confirm-order-delete");
    const board = document.getElementById("orders-board");
    const quoteModal = document.getElementById("order-quote-modal");
    const quoteYes = document.getElementById("order-quote-yes");
    const quoteNo = document.getElementById("order-quote-no");
    let quoteOrder = null;

    if (!orderModal || !deleteModal || !orderForm || !newOrderBtn || !board) return;

    const closeModal = (modal) => { modal.hidden = true; };

    [orderModal, deleteModal, quoteModal].filter(Boolean).forEach((modal) => {
        modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
            btn.addEventListener("click", () => closeModal(modal));
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(modal);
        });
    });

    // O document não é recriado: remove o listener da visita anterior
    if (ordersEscHandler) document.removeEventListener("keydown", ordersEscHandler);

    ordersEscHandler = (event) => {
        if (event.key !== "Escape") return;
        [orderModal, deleteModal, quoteModal].filter(Boolean).forEach(closeModal);
    };
    document.addEventListener("keydown", ordersEscHandler);

    quoteNo?.addEventListener("click", () => closeModal(quoteModal));

    quoteYes?.addEventListener("click", async () => {
        if (!quoteOrder || quoteYes.disabled) return;

        quoteYes.disabled = true;

        try {
            if (await exportOrderQuotePDF(quoteOrder)) {
                closeModal(quoteModal);
            }
        } finally {
            quoteYes.disabled = false;
        }
    });

    const newEditor = initProductPicker();

    const syncNewInstallments = bindInstallments(
        document.getElementById("order-payment"),
        document.getElementById("order-installments")
    );

    /* Novo pedido */
    newOrderBtn.addEventListener("click", () => {
        orderForm.reset();
        newEditor.reset();
        syncNewInstallments();
        document.getElementById("picker-panel").hidden = true;
        orderModal.hidden = false;
        document.getElementById("order-customer").focus();
    });

    orderForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitBtn = orderForm.querySelector('button[type="submit"]');
        const price = document.getElementById("order-price").value;
        const deadline = document.getElementById("order-deadline").value;

        const body = {
            customer: document.getElementById("order-customer").value.trim(),
            items: newEditor.get(),
            price: price === "" ? null : Number(price),
            deadline: deadline || null,
            notes: document.getElementById("order-notes").value.trim(),
            payment_method: document.getElementById("order-payment").value || null,
            installments: document.getElementById("order-payment").value === "credito"
                ? Number(document.getElementById("order-installments").value) || null
                : null,
        };

        if (!body.items.length) { alert("Adicione pelo menos um produto ao pedido."); return; }
        submitBtn.disabled = true;

        try {
            const response = await apiFetch(ORDERS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const created = await response.json().catch(() => null);

            orderForm.reset();
            newEditor.reset();
            closeModal(orderModal);
            quoteOrder = { ...body, ...created };
            if (quoteModal?.isConnected) {
                quoteModal.hidden = false;
                quoteYes?.focus();
            }
            await loadOrders(created?.id ?? null); // o card novo entra com animação
        } catch (erro) {
            console.error("Erro ao criar pedido:", erro);
            alert("Não foi possível criar o pedido.");
        } finally {
            submitBtn.disabled = false;
        }
    });

    /* Excluir pedido (clique no lixinho do card) */
    board.addEventListener("click", (event) => {
        const deleteBtn = event.target.closest(".order-delete");
        if (!deleteBtn) return;

        deleteModal.dataset.orderId = deleteBtn.dataset.id;
        deleteModal.hidden = false;
    });

    confirmDelete.addEventListener("click", async () => {
        const id = deleteModal.dataset.orderId;
        if (!id) return;

        confirmDelete.disabled = true;

        try {
            const response = await apiFetch(`${ORDERS_API_URL}/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            allOrders = allOrders.filter((o) => String(o.id) !== String(id));
            renderOrders();
            closeModal(deleteModal);
        } catch (erro) {
            console.error("Erro ao excluir pedido:", erro);
            alert("Não foi possível excluir o pedido.");
        } finally {
            confirmDelete.disabled = false;
        }
    });
}

/* ---------- Modal de edição do pedido ---------- */

let editOrderEscHandler = null;

function initOrderEditModal() {
    const modal = document.getElementById("order-edit-modal");
    const form = document.getElementById("order-edit-form");
    const board = document.getElementById("orders-board");
    if (!modal || !form || !board) return;

    const customer = document.getElementById("edit-order-customer");
    const product = document.getElementById("edit-order-product");
    const quantity = document.getElementById("edit-order-quantity");
    const price = document.getElementById("edit-order-price");
    const deadline = document.getElementById("edit-order-deadline");
    const notes = document.getElementById("edit-order-notes");
    const payment = document.getElementById("edit-order-payment");
    const installments = document.getElementById("edit-order-installments");
    const editEditor = initItemsEditor("edit-");
    const syncInstallments = bindInstallments(payment, installments);
    const title = document.getElementById("order-edit-title");

    const closeModal = () => { modal.hidden = true; };

    modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", closeModal);
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });

    if (editOrderEscHandler) document.removeEventListener("keydown", editOrderEscHandler);

    editOrderEscHandler = (event) => {
        if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", editOrderEscHandler);

    // Clique no lápis: abre o modal com os dados atuais já preenchidos
    board.addEventListener("click", (event) => {
        const editBtn = event.target.closest(".order-edit");
        if (!editBtn) return;

        const order = allOrders.find((o) => String(o.id) === String(editBtn.dataset.id));
        if (!order) return;

        modal.dataset.orderId = order.id;
        title.textContent = `Editar pedido ${formatOrderNumber(order.number)}`;

        customer.value = order.customer ?? "";
        editEditor.set(orderItemsOf(order));
        // O input date precisa de "YYYY-MM-DD"
        deadline.value = order.deadline ? String(order.deadline).slice(0, 10) : "";
        notes.value = order.notes ?? "";
        payment.value = order.payment_method ?? "";
        syncInstallments();
        installments.value = order.installments || 1;

        modal.hidden = false;
        customer.focus();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const id = modal.dataset.orderId;
        if (!id) return;

        const submitBtn = form.querySelector('button[type="submit"]');

        const body = {
            customer: customer.value.trim(),
            items: editEditor.get(),
            price: price.value === "" ? null : Number(price.value),
            deadline: deadline.value || null,
            notes: notes.value.trim(),
            payment_method: payment.value || null,
            installments: payment.value === "credito" ? Number(installments.value) || null : null,
        };

        if (!body.items.length) { alert("Adicione pelo menos um produto ao pedido."); return; }
        submitBtn.disabled = true;

        try {
            const response = await apiFetch(`${ORDERS_API_URL}/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await loadOrders();
            closeModal();
        } catch (erro) {
            console.error("Erro ao atualizar pedido:", erro);
            alert("Não foi possível salvar as alterações do pedido.");
        } finally {
            submitBtn.disabled = false;
        }
    });
}

/* ---------- Modal de detalhes do pedido ---------- */

let detailEscHandler = null;

function openOrderDetail(id) {
    const modal = document.getElementById("order-detail-modal");
    const order = allOrders.find((o) => String(o.id) === String(id));
    if (!modal || !order) return;
    modal.dataset.orderId = order.id;

    const setText = (elId, text) => {
        document.getElementById(elId).textContent = text;
    };

    const deadline = parseDeadline(order.deadline);
    const quantity = Number(order.quantity) || 1;
    const status = ORDER_STATUSES.find((s) => s.value === order.status);
    const statusLabel = status ? status.label : order.status;

    setText("order-detail-number", `Pedido ${formatOrderNumber(order.number)}`);
    setText("order-detail-title", order.customer);
    setText("order-detail-customer", order.customer);
    setText("order-detail-product", orderItemsOf(order).map(item => `${item.quantity}× ${item.name}`).join(" | "));
    setText("order-detail-quantity", `${quantity} ${quantity === 1 ? "unidade" : "unidades"}`);
    setText("order-detail-price", formatPrice(order.price));
    setText("order-detail-deadline", deadline
        ? deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        : "Sem prazo");
    setText("order-detail-stage", statusLabel);
    setText("order-detail-payment", paymentDescription(order.payment_method, order.installments) || "Não informada");
    setText("order-detail-status", statusLabel);

    // Links do MakerWorld dos produtos do pedido (pelo id; pedidos antigos, pelo nome)
    const catalogo = allProducts?.length ? allProducts : pickerProducts;
    const links = orderItemsOf(order).map((item) => {
        const produto = catalogo.find((p) => item.product_id != null
            ? String(p.id) === String(item.product_id)
            : (p.name || "").trim().toLowerCase() === (item.name || "").trim().toLowerCase());
        const link = makerworldLinkHtml(produto?.makerworld_url, item.name);
        return link ? `<li>${link}</li>` : "";
    }).filter(Boolean);
    document.getElementById("order-detail-makerworld").innerHTML = links.join("");
    document.getElementById("order-detail-makerworld-group").hidden = !links.length;

    const notes = document.getElementById("order-detail-notes");
    notes.textContent = order.notes || "Sem observações.";
    notes.classList.toggle("is-empty", !order.notes);

    // Data de criação (só aparece se a API enviar o campo)
    const createdRaw = order.created_at || order.createdAt;
    const created = createdRaw ? new Date(createdRaw) : null;
    setText("order-detail-created", created && !isNaN(created)
        ? `Criado em ${created.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`
        : "");

    // Cor do selo acompanha a etapa
    document.getElementById("order-detail-status").dataset.status = order.status;
    document.getElementById("order-detail-overdue").hidden = !isOverdue(order);

    modal.hidden = false;
    lucide.createIcons();
}

function initOrderDetailModal() {
    const modal = document.getElementById("order-detail-modal");
    const board = document.getElementById("orders-board");
    if (!modal || !board) return;

    const closeModal = () => { modal.hidden = true; };

    document.getElementById("order-detail-export-pdf").addEventListener("click", () => {
        const order = allOrders.find(o => String(o.id) === modal.dataset.orderId);
        if (order) exportOrderQuotePDF(order);
    });

    modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", closeModal);
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });

    if (detailEscHandler) document.removeEventListener("keydown", detailEscHandler);

    detailEscHandler = (event) => {
        if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", detailEscHandler);

    // Clique no card (ignora lixeira e seletor "Mover para")
    board.addEventListener("click", (event) => {
        if (event.target.closest(".order-delete, .order-edit, .order-move, .order-installments-btn")) return;

        const card = event.target.closest(".order-card");
        if (!card) return;

        openOrderDetail(card.dataset.id);
    });
}

/* ============================================================
   Inicialização da página de Pedidos
   (chamada no fim de ordersPage(), em pages.js)
   ============================================================ */
function localInstallmentDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initOrdersPage() {

    initOrdersDragAndDrop();
    initOrderStatusSelect();
    initOrderModals();
    initOrderEditModal();
    initOrderDetailModal();

    lucide.createIcons();
    loadOrders(null, true);
    loadProductSuggestions();
}