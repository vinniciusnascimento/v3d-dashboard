/* ============================================================
   Pedidos: quadro Kanban com drag and drop
   Os pedidos ficam salvos no navegador (localStorage).
   Para usar o back-end, troque readOrders() e writeOrders().
   ============================================================ */
const ORDERS_STORAGE_KEY = "v3d-orders";
const ORDERS_COUNTER_KEY = "v3d-orders-counter";
const ORDER_STATUSES = ["aguardando", "imprimindo", "finalizacao", "concluido"];

let orders = [];
let draggedOrderId = null;
let ordersEscHandler = null;

/* ---------- Armazenamento ---------- */
function readOrders() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || "[]");
        return Array.isArray(parsed)
            ? parsed.filter((o) => o && ORDER_STATUSES.includes(o.status))
            : [];
    } catch {
        return [];
    }
}

function writeOrders() {
    try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch (erro) {
        console.error("Erro ao salvar pedidos:", erro);
    }
}

// Número sequencial que nunca se repete, mesmo depois de excluir pedidos
function nextOrderNumber() {
    let last = 0;
    try {
        last = Number(localStorage.getItem(ORDERS_COUNTER_KEY)) || 0;
    } catch { /* sem acesso ao storage */ }

    last = Math.max(last, ...orders.map((o) => Number(o.number) || 0));

    try {
        localStorage.setItem(ORDERS_COUNTER_KEY, String(last + 1));
    } catch { /* sem acesso ao storage */ }

    return last + 1;
}

function createOrderId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- Formatação ---------- */
function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDeadline(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function formatMoney(value) {
    return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}

/* ---------- Renderização ---------- */
function orderCardHTML(order, isNew) {
    const id = escapeHtml(order.id);
    const quantity = Number(order.quantity) || 1;
    const deadline = formatDeadline(order.deadline);
    const overdue = deadline && order.status !== "concluido" && order.deadline < todayISO();
    const hasPrice = order.price !== null && order.price !== undefined && order.price !== "";

    return `
        <article class="order-card${isNew ? " is-new" : ""}" draggable="true" data-id="${id}">
            <div class="order-card-top">
                <span class="order-number">#${String(order.number).padStart(3, "0")}</span>
                <button type="button" class="order-delete" data-delete="${id}" aria-label="Excluir pedido">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>

            <h3 class="order-customer">${escapeHtml(order.customer)}</h3>
            <p class="order-product"><i data-lucide="box"></i>${quantity}× ${escapeHtml(order.product)}</p>
            ${order.notes ? `<p class="order-notes">${escapeHtml(order.notes)}</p>` : ""}

            <div class="order-meta">
                ${deadline
            ? `<span class="order-deadline${overdue ? " overdue" : ""}"><i data-lucide="calendar"></i>${deadline}</span>`
            : `<span></span>`}
                ${hasPrice ? `<span class="order-price">${formatMoney(order.price)}</span>` : ""}
            </div>
        </article>
    `;
}

function renderOrders(newId = null) {
    const board = document.getElementById("orders-board");
    if (!board) return;

    ORDER_STATUSES.forEach((status) => {
        const list = board.querySelector(`.order-list[data-status="${status}"]`);
        const items = orders.filter((o) => o.status === status);

        list.innerHTML = items.map((o) => orderCardHTML(o, o.id === newId)).join("");
        list.closest(".order-column").querySelector(".column-count").textContent = items.length;
    });

    lucide.createIcons();
}

/* ---------- Drag and drop ---------- */

// Descobre antes de qual card o item arrastado deve ser inserido
function getDragAfterElement(list, y) {
    const cards = [...list.querySelectorAll(".order-card:not(.dragging)")];

    return cards.reduce(
        (closest, card) => {
            const box = card.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            return offset < 0 && offset > closest.offset
                ? { offset, element: card }
                : closest;
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
}

// Lê a posição final dos cards na tela e grava no array de pedidos
function syncOrdersFromBoard(board) {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const next = [];

    ORDER_STATUSES.forEach((status) => {
        board
            .querySelectorAll(`.order-list[data-status="${status}"] .order-card`)
            .forEach((card) => {
                const order = byId.get(card.dataset.id);
                if (!order) return;

                order.status = status;
                next.push(order);
                byId.delete(card.dataset.id);
            });
    });

    orders = [...next, ...byId.values()];
    writeOrders();
}

function clearDragHighlight(board) {
    board.querySelectorAll(".order-column.drag-over").forEach((c) => c.classList.remove("drag-over"));
}

function initBoardDragAndDrop(board) {
    board.addEventListener("dragstart", (event) => {
        const card = event.target.closest?.(".order-card");
        if (!card) return;

        draggedOrderId = card.dataset.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedOrderId); // exigido pelo Firefox

        // Adiado para que a imagem do arrasto saia com o visual normal
        setTimeout(() => card.classList.add("dragging"), 0);
    });

    board.addEventListener("dragover", (event) => {
        if (!draggedOrderId) return;

        const column = event.target.closest?.(".order-column");
        if (!column) return;

        event.preventDefault(); // permite soltar aqui
        event.dataTransfer.dropEffect = "move";

        clearDragHighlight(board);
        column.classList.add("drag-over");

        const dragging = board.querySelector(".order-card.dragging");
        if (!dragging) return;

        const list = column.querySelector(".order-list");
        const after = getDragAfterElement(list, event.clientY);

        if (after) {
            if (dragging.nextElementSibling !== after) list.insertBefore(dragging, after);
        } else if (list.lastElementChild !== dragging) {
            list.appendChild(dragging);
        }
    });

    board.addEventListener("dragleave", (event) => {
        const column = event.target.closest?.(".order-column");
        if (column && !column.contains(event.relatedTarget)) {
            column.classList.remove("drag-over");
        }
    });

    board.addEventListener("drop", (event) => {
        if (!draggedOrderId) return;
        event.preventDefault();
        syncOrdersFromBoard(board);
    });

    // Sempre redesenha a partir do estado salvo: confirma o drop
    // ou desfaz o movimento se o arrasto foi cancelado (Esc, fora do quadro).
    board.addEventListener("dragend", () => {
        draggedOrderId = null;
        clearDragHighlight(board);
        renderOrders();
    });
}

/* ---------- Sugestões de produtos para o formulário ---------- */
async function fillProductSuggestions() {
    let products = typeof allProducts !== "undefined" ? allProducts : [];

    if (!products.length) {
        try {
            const response = await fetch(API_URL);
            if (response.ok) {
                const dados = await response.json();
                products = Array.isArray(dados) ? dados : (dados.produtos || dados.data || []);
            }
        } catch {
            // sem API: o campo continua aceitando texto livre
        }
    }

    const datalist = document.getElementById("order-product-list");
    if (!datalist) return; // saiu da página enquanto carregava

    datalist.replaceChildren(
        ...products
            .filter((p) => p.name)
            .map((p) => {
                const option = document.createElement("option");
                option.value = p.name;
                return option;
            })
    );
}

/* ---------- Inicialização da página ---------- */
function initOrdersPage() {
    const board = document.getElementById("orders-board");
    const orderModal = document.getElementById("order-modal");
    const deleteModal = document.getElementById("order-delete-modal");
    const orderForm = document.getElementById("order-form");
    const openBtn = document.getElementById("new-order");
    const confirmDeleteBtn = document.getElementById("confirm-order-delete");

    if (!board || !orderModal || !deleteModal || !orderForm || !openBtn) return;

    orders = readOrders();
    renderOrders();
    fillProductSuggestions();

    initBoardDragAndDrop(board);

    /* Modais */
    const closeModal = (modal) => {
        modal.hidden = true;
    };

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

    /* Novo pedido */
    openBtn.addEventListener("click", () => {
        orderForm.reset();
        orderModal.hidden = false;
        document.getElementById("order-customer").focus();
    });

    orderForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const customer = document.getElementById("order-customer").value.trim();
        const product = document.getElementById("order-product").value.trim();
        if (!customer || !product) return;

        const priceValue = document.getElementById("order-price").value;

        const order = {
            id: createOrderId(),
            number: nextOrderNumber(),
            customer,
            product,
            quantity: Math.max(1, Number(document.getElementById("order-quantity").value) || 1),
            price: priceValue === "" ? null : Number(priceValue),
            deadline: document.getElementById("order-deadline").value,
            notes: document.getElementById("order-notes").value.trim(),
            status: "aguardando",
            createdAt: Date.now(),
        };

        orders.push(order);
        writeOrders();
        renderOrders(order.id);

        orderForm.reset();
        closeModal(orderModal);
    });

    /* Excluir pedido */
    board.addEventListener("click", (event) => {
        const deleteBtn = event.target.closest(".order-delete");
        if (!deleteBtn) return;

        deleteModal.dataset.orderId = deleteBtn.dataset.delete;
        deleteModal.hidden = false;
    });

    confirmDeleteBtn.addEventListener("click", () => {
        const id = deleteModal.dataset.orderId;
        if (!id) return;

        orders = orders.filter((o) => o.id !== id);
        writeOrders();
        renderOrders();
        closeModal(deleteModal);
    });

    lucide.createIcons();
}