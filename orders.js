/* ============================================================
   Pedidos: quadro Kanban
   Depende de: app.js (escapeHtml, formatPrice, API_URL) e lucide
   ============================================================ */

const ORDERS_API_URL = "/api/orders";

let allOrders = [];
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

/* ---------- Card ---------- */

function createOrderCard(order, isNew = false) {
    const deadline = parseDeadline(order.deadline);
    const overdue = isOverdue(order);
    const quantity = Number(order.quantity) || 1;

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
                <span>${quantity}× ${escapeHtml(order.product)}</span>
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

async function loadOrders(newId = null) {
    try {
        const response = await fetch(ORDERS_API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        allOrders = Array.isArray(data) ? data : (data.pedidos || data.data || []);

        // A pessoa pode ter saído da página enquanto a resposta chegava
        if (!document.getElementById("orders-board")) return;

        renderOrders(newId);
    } catch (erro) {
        console.error("Erro ao carregar pedidos:", erro);

        const board = document.getElementById("orders-board");
        if (board) alert("Não foi possível carregar os pedidos.");
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

function renderProductPicker(filter = "") {
    const grid = document.getElementById("picker-grid");
    if (!grid) return;

    const term = filter.toLowerCase().trim();
    const list = pickerProducts.filter((p) => (p.name || "").toLowerCase().includes(term));

    if (!list.length) {
        grid.innerHTML = `<p class="picker-empty">Nenhum produto encontrado.</p>`;
        return;
    }

    grid.innerHTML = list.map((p, index) => {
        const src = productImageSrc(p);

        return `
        <button type="button" class="picker-card" data-id="${p.id}" style="--i:${Math.min(index, 10)}">
                <span class="picker-card-image">
                    ${src
                ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">`
                : `<i data-lucide="image"></i>`}
                </span>
                <span class="picker-card-name">${escapeHtml(p.name)}</span>
                <span class="picker-card-price">${formatPrice(p.price)}</span>
            </button>
        `;
    }).join("");

    lucide.createIcons();
}

function initProductPicker() {
    const picker = document.getElementById("product-picker");
    const input = document.getElementById("order-product");
    const panel = document.getElementById("picker-panel");
    const grid = document.getElementById("picker-grid");
    const priceInput = document.getElementById("order-price");
    const quantityInput = document.getElementById("order-quantity");

    if (!picker || !input || !panel || !grid) return;

    const open = () => {
        const wasClosed = panel.hidden;

        renderProductPicker(input.value);
        grid.classList.toggle("animate-cards", wasClosed); // só anima ao abrir, não a cada tecla
        panel.hidden = false;
    };
    const close = () => { panel.hidden = true; };

    input.addEventListener("focus", open);
    input.addEventListener("click", open);
    input.addEventListener("input", open); // filtra enquanto digita

    grid.addEventListener("click", (event) => {
        const card = event.target.closest(".picker-card");
        if (!card) return;

        const product = pickerProducts.find((p) => String(p.id) === card.dataset.id);
        if (!product) return;

        input.value = product.name;

        // Se o valor total ainda está vazio, sugere preço × quantidade
        if (priceInput.value === "" && product.price != null) {
            const qty = Number(quantityInput.value) || 1;
            priceInput.value = (Number(product.price) * qty).toFixed(2);
        }

        close();
    });

    // Fecha ao clicar fora (remove o listener da visita anterior)
    if (pickerOutsideHandler) document.removeEventListener("click", pickerOutsideHandler);

    pickerOutsideHandler = (event) => {
        const currentPicker = document.getElementById("product-picker");
        if (currentPicker && !currentPicker.contains(event.target)) {
            document.getElementById("picker-panel").hidden = true;
        }
    };
    document.addEventListener("click", pickerOutsideHandler);
}

// Busca o catálogo e prepara o seletor
async function loadProductSuggestions() {
    try {
        let produtos = typeof allProducts !== "undefined" ? allProducts : [];

        if (!produtos.length) {
            const response = await fetch(API_URL);
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
        const response = await fetch(`${ORDERS_API_URL}/reordenar`, {
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
        const response = await fetch(`${ORDERS_API_URL}/reordenar`, {
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

/* ---------- Modais: novo pedido e exclusão ---------- */

function initOrderModals() {
    const orderModal = document.getElementById("order-modal");
    const deleteModal = document.getElementById("order-delete-modal");
    const orderForm = document.getElementById("order-form");
    const newOrderBtn = document.getElementById("new-order");
    const confirmDelete = document.getElementById("confirm-order-delete");
    const board = document.getElementById("orders-board");

    if (!orderModal || !deleteModal || !orderForm || !newOrderBtn || !board) return;

    const closeModal = (modal) => { modal.hidden = true; };

    [orderModal, deleteModal].forEach((modal) => {
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
        [orderModal, deleteModal].forEach(closeModal);
    };
    document.addEventListener("keydown", ordersEscHandler);

    initProductPicker();

    /* Novo pedido */
    newOrderBtn.addEventListener("click", () => {
        orderForm.reset();
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
            product: document.getElementById("order-product").value.trim(),
            quantity: Number(document.getElementById("order-quantity").value) || 1,
            price: price === "" ? null : Number(price),
            deadline: deadline || null,
            notes: document.getElementById("order-notes").value.trim(),
        };

        submitBtn.disabled = true;

        try {
            const response = await fetch(ORDERS_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const created = await response.json().catch(() => null);

            orderForm.reset();
            closeModal(orderModal);
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
            const response = await fetch(`${ORDERS_API_URL}/${id}`, { method: "DELETE" });
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
        product.value = order.product ?? "";
        quantity.value = Number(order.quantity) || 1;
        price.value = order.price ?? "";
        // O input date precisa de "YYYY-MM-DD"
        deadline.value = order.deadline ? String(order.deadline).slice(0, 10) : "";
        notes.value = order.notes ?? "";

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
            product: product.value.trim(),
            quantity: Number(quantity.value) || 1,
            price: price.value === "" ? null : Number(price.value),
            deadline: deadline.value || null,
            notes: notes.value.trim(),
        };

        submitBtn.disabled = true;

        try {
            const response = await fetch(`${ORDERS_API_URL}/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Atualiza a cópia local (status e posição continuam os mesmos)
            const order = allOrders.find((o) => String(o.id) === String(id));
            if (order) Object.assign(order, body);

            renderOrders();
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
    setText("order-detail-product", order.product);
    setText("order-detail-quantity", `${quantity} ${quantity === 1 ? "unidade" : "unidades"}`);
    setText("order-detail-price", formatPrice(order.price));
    setText("order-detail-deadline", deadline
        ? deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        : "Sem prazo");
    setText("order-detail-stage", statusLabel);
    setText("order-detail-status", statusLabel);

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
        if (event.target.closest(".order-delete, .order-edit, .order-move")) return;

        const card = event.target.closest(".order-card");
        if (!card) return;

        openOrderDetail(card.dataset.id);
    });
}

/* ============================================================
   Inicialização da página de Pedidos
   (chamada no fim de ordersPage(), em pages.js)
   ============================================================ */
function initOrdersPage() {
    initOrdersDragAndDrop();
    initOrderStatusSelect();
    initOrderModals();
    initOrderEditModal();
    initOrderDetailModal();

    lucide.createIcons();
    loadOrders();
    loadProductSuggestions();
}