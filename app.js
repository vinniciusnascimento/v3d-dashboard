lucide.createIcons();

/* ============================================================
   Tema
   ============================================================ */
const themeToggle = document.getElementById("theme-toggle");
const html = document.documentElement;

const savedTheme = localStorage.getItem("v3d-theme") || "light";
html.setAttribute("data-theme", savedTheme);

function updateThemeButton() {
    const isDark = html.getAttribute("data-theme") === "dark";

    themeToggle.innerHTML = `
        <i data-lucide="${isDark ? "sun" : "moon"}"></i>
        <span>${isDark ? "Modo claro" : "Modo escuro"}</span>
    `;

    lucide.createIcons();
}

updateThemeButton();

themeToggle.addEventListener("click", () => {
    const newTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";

    html.setAttribute("data-theme", newTheme);
    localStorage.setItem("v3d-theme", newTheme);

    updateThemeButton();
});

/* ============================================================
   Navegação entre páginas
   ============================================================ */
const navPages = {
    products: () => productsPage(),
    orders: () => ordersPage(),
};

const navLinks = document.querySelectorAll("nav a[data-page]");

navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();

        navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");

        navPages[link.dataset.page]();
    });
});

/* ============================================================
   Utilitários
   ============================================================ */
const API_URL = "/api/produtos";
const IMAGES_PATH = "assets/products/";

let productsList = null;   // recriado a cada vez que a página de produtos é exibida
let allProducts = [];
let newColorsField = null; // chips de cores do cadastro
let editColorsField = null; // chips de cores da edição
let escHandler = null;

function escapeHtml(text = "") {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// colors vem como JSON: pode chegar como array ou como string
function parseColors(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Se for uma cor CSS válida (#16A34A, red...), mostra a bolinha.
// Senão (ex: "Vermelho"), mostra como etiqueta de texto.
function renderColor(cor) {
    const nome = escapeHtml(String(cor));
    return CSS.supports("color", cor)
        ? `<span class="color-dot" style="background:${nome}" title="${nome}"></span>`
        : `<span class="color-label">${nome}</span>`;
}

function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "Sob consulta";

    return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

/* ============================================================
   Campo de cores (usado no cadastro e na edição)
   ============================================================ */
function createColorsField({ picker, input, addBtn, list }) {
    let colors = [];

    function render() {
        list.innerHTML = colors.map((cor, i) => `
            <span class="color-chip">
                ${CSS.supports("color", cor)
                ? `<span class="color-dot" style="background:${escapeHtml(cor)}"></span>`
                : ""}
                ${escapeHtml(cor)}
                <button type="button" data-index="${i}" aria-label="Remover ${escapeHtml(cor)}">
                    <i data-lucide="x"></i>
                </button>
            </span>
        `).join("");

        lucide.createIcons();
    }

    function add(value) {
        const cor = value.trim();
        if (!cor) return;

        const jaExiste = colors.some((c) => c.toLowerCase() === cor.toLowerCase());
        if (!jaExiste) colors.push(cor);

        input.value = "";
        render();
    }

    // O seletor de cor preenche o campo com o código hex
    picker.addEventListener("input", () => {
        input.value = picker.value;
    });

    addBtn.addEventListener("click", () => add(input.value));

    // Enter adiciona a cor sem enviar o formulário
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            add(input.value);
        }
    });

    // Remover cor pelo "x" do chip
    list.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-index]");
        if (!btn) return;

        colors.splice(Number(btn.dataset.index), 1);
        render();
    });

    return {
        // inclui o que estiver digitado e ainda não foi adicionado
        get() {
            add(input.value);
            return [...colors];
        },
        set(newColors) {
            colors = [...newColors];
            input.value = "";
            render();
        },
        reset() {
            colors = [];
            input.value = "";
            render();
        },
    };
}

/* ============================================================
   Modal de novo produto
   ============================================================ */
function initProductModal() {
    const modal = document.getElementById("product-modal");
    const openBtn = document.getElementById("new-product");
    const closeBtn = document.getElementById("close-modal");
    const cancelBtn = document.getElementById("cancel-product");

    if (!modal || !openBtn) return;

    const closeModal = () => {
        modal.hidden = true;
    };

    openBtn.addEventListener("click", () => {
        modal.hidden = false;
    });

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });
}

/* ============================================================
   Upload de imagem (cadastro)
   ============================================================ */
function initImageUpload() {
    const uploadArea = document.getElementById("upload-area");
    const imageInput = document.getElementById("product-image");
    const preview = document.getElementById("image-preview");

    if (!uploadArea || !imageInput || !preview) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const maxSize = 2 * 1024 * 1024;
    let previewUrl = null;

    function showImage(file) {
        if (!file) return;

        if (!allowedTypes.includes(file.type)) {
            alert("Selecione uma imagem PNG, JPG ou WebP.");
            return;
        }

        if (file.size > maxSize) {
            alert("A imagem deve ter no máximo 2 MB.");
            return;
        }

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
    }

    imageInput.addEventListener("change", () => {
        showImage(imageInput.files[0]);
    });

    uploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        uploadArea.classList.add("dragging");
    });

    uploadArea.addEventListener("dragleave", (event) => {
        if (!uploadArea.contains(event.relatedTarget)) {
            uploadArea.classList.remove("dragging");
        }
    });

    uploadArea.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadArea.classList.remove("dragging");

        const file = event.dataTransfer.files[0];
        if (!file) return;

        if (!allowedTypes.includes(file.type) || file.size > maxSize) {
            showImage(file); // mostra o alerta de erro
            return;
        }

        // Atualiza o input com o arquivo arrastado
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;

        showImage(file);
    });
}

/* ============================================================
   Listagem, estatísticas e filtros
   ============================================================ */
function renderProducts(produtos) {
    if (!productsList) return;

    if (!produtos.length) {
        productsList.innerHTML = `<p class="products-empty">Nenhum produto encontrado.</p>`;
    } else {
        productsList.innerHTML = produtos.map((produto, index) => {
            const cores = parseColors(produto.colors);

            return `
                <article class="product-card" data-id="${produto.id}" style="--i:${Math.min(index, 12)}">
                    <div class="product-image">
                        ${produto.has_image || produto.image
                    ? `<img src="${produto.has_image ? `${API_URL}/${produto.id}/imagem` : IMAGES_PATH + escapeHtml(produto.image)}" alt="${escapeHtml(produto.name)}" loading="lazy">`
                    : `<i data-lucide="image"></i>`}
                    </div>

                    <div class="product-body">
                        <span class="product-category">${escapeHtml(produto.category)}</span>
                        <h3 class="product-name">${escapeHtml(produto.name)}</h3>
                        <p class="product-description">${escapeHtml(produto.desc || "Sem descrição.")}</p>

                        <div class="product-specs">
                            ${produto.size ? `<span class="spec-chip"><i data-lucide="ruler"></i>${escapeHtml(produto.size)}</span>` : ""}
                            ${produto.material ? `<span class="spec-chip"><i data-lucide="box"></i>${escapeHtml(produto.material)}</span>` : ""}
                        </div>

                        ${cores.length ? `<div class="product-colors">${cores.map(renderColor).join("")}</div>` : ""}

                        <div class="product-meta">
                            <span class="product-price">${formatPrice(produto.price)}</span>
                        </div>
                    </div>

                    <div class="product-actions">
                        <button type="button" class="btn-edit" data-id="${produto.id}">
                            <i data-lucide="pencil"></i>Editar
                        </button>
                        <button type="button" class="btn-delete" data-id="${produto.id}">
                            <i data-lucide="trash-2"></i>Excluir
                        </button>
                    </div>
                </article>
            `;
        }).join("");
    }

    document.getElementById("products-count").textContent =
        `${produtos.length} ${produtos.length === 1 ? "produto encontrado" : "produtos encontrados"}`;

    lucide.createIcons();
}

function updateStats(produtos) {
    document.getElementById("total-products").textContent = produtos.length;
    document.getElementById("active-products").textContent =
        new Set(produtos.map((p) => p.category)).size;
    document.getElementById("low-stock").textContent =
        produtos.filter((p) => !p.image).length;
}

function applyFilters() {
    const search = document.getElementById("search-products").value.toLowerCase().trim();
    const category = document.getElementById("category-filter").value;

    const filtered = allProducts.filter((p) => {
        const matchSearch = (p.name || "").toLowerCase().includes(search);
        const matchCategory = !category || p.category === category;
        return matchSearch && matchCategory;
    });

    renderProducts(filtered);
}

function initFilters() {
    ["search-products", "category-filter"].forEach((id) => {
        document.getElementById(id).addEventListener("input", applyFilters);
    });
}

async function loadProducts() {
    try {
        const resposta = await fetch(API_URL);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const dados = await resposta.json();
        allProducts = Array.isArray(dados) ? dados : (dados.produtos || dados.data || []);

        // Se a pessoa saiu da página enquanto a resposta chegava, não há onde desenhar
        if (!document.getElementById("products-list")) return;

        updateStats(allProducts);
        applyFilters(); // respeita busca/categoria já escolhidas
    } catch (erro) {
        console.error("Erro ao carregar produtos:", erro);
        if (productsList) {
            productsList.innerHTML = `<p class="products-empty">Não foi possível carregar os produtos.</p>`;
        }
    }
}

/* ============================================================
   Cadastro de produto
   ============================================================ */
function initProductForm() {
    const productForm = document.querySelector("#product-form");
    if (!productForm) return;

    productForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const imageFile = document.querySelector("#product-image").files[0];

        const formData = new FormData();
        formData.append("name", document.querySelector("#product-name").value.trim());
        formData.append("desc", document.querySelector("#product-description").value.trim());
        formData.append("category", document.querySelector("#product-category").value);
        formData.append("price", document.querySelector("#product-price").value);
        formData.append("size", document.querySelector("#product-size").value.trim());
        formData.append("material", document.querySelector("#product-material").value.trim());
        formData.append("colors", JSON.stringify(newColorsField.get()));

        if (imageFile) formData.append("image", imageFile);

        try {
            const resposta = await fetch(API_URL, {
                method: "POST",
                body: formData, // sem Content-Type: o navegador define sozinho
            });

            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

            productForm.reset();
            newColorsField.reset();
            document.getElementById("image-preview").hidden = true;
            document.getElementById("product-modal").hidden = true;

            loadProducts();
        } catch (erro) {
            console.error("ERRO NO POST:", erro);
            alert("Não foi possível salvar o produto.");
        }
    });
}

/* ============================================================
   Modais de editar e excluir
   ============================================================ */
function initActionModals() {
    const editModal = document.getElementById("edit-modal");
    const deleteModal = document.getElementById("delete-modal");

    if (!editModal || !deleteModal || !productsList) return;

    const nameInput = document.querySelector("#edit-name");
    const description = document.querySelector("#edit-description");
    const price = document.querySelector("#edit-price");
    const category = document.querySelector("#edit-category");
    const size = document.querySelector("#edit-size");
    const material = document.querySelector("#edit-material");
    const imageInput = document.querySelector("#edit-image");
    const btnSave = document.querySelector("#save-edit");
    const btnDelete = document.querySelector("#confirm-delete");

    function closeModal(modal) {
        modal.hidden = true;
    }

    function openEditModal(productId) {
        const produto = allProducts.find((p) => String(p.id) === String(productId));
        if (!produto) return;

        editModal.dataset.productId = productId;

        nameInput.value = produto.name ?? "";
        description.value = produto.desc ?? "";
        price.value = produto.price ?? "";
        category.value = produto.category ?? "";
        size.value = produto.size ?? "";
        material.value = produto.material ?? "";
        imageInput.value = "";
        editColorsField.set(parseColors(produto.colors));

        editModal.hidden = false;
    }

    function openDeleteModal(productId) {
        deleteModal.dataset.productId = productId;
        deleteModal.hidden = false;
    }

    // Os cards são recriados pelo JS, então escutamos o clique na lista
    productsList.addEventListener("click", (event) => {
        const editBtn = event.target.closest(".btn-edit");
        const deleteBtn = event.target.closest(".btn-delete");

        if (editBtn) openEditModal(editBtn.dataset.id);
        if (deleteBtn) openDeleteModal(deleteBtn.dataset.id);
    });

    [editModal, deleteModal].forEach((modal) => {
        modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
            btn.addEventListener("click", () => closeModal(modal));
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(modal);
        });
    });

    // O document não é recriado: remove o listener da visita anterior
    if (escHandler) document.removeEventListener("keydown", escHandler);

    escHandler = (event) => {
        if (event.key !== "Escape") return;
        [editModal, deleteModal].forEach((modal) => closeModal(modal));
    };
    document.addEventListener("keydown", escHandler);

    btnSave.addEventListener("click", async (event) => {
        event.preventDefault();

        const id = editModal.dataset.productId;
        if (!id) return;

        const formData = new FormData();
        formData.append("name", nameInput.value.trim());
        formData.append("desc", description.value.trim());
        formData.append("price", price.value);
        formData.append("category", category.value);
        formData.append("size", size.value.trim());
        formData.append("material", material.value.trim());
        formData.append("colors", JSON.stringify(editColorsField.get()));

        if (imageInput.files[0]) formData.append("image", imageInput.files[0]);

        btnSave.disabled = true;

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: "PUT",
                body: formData,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await loadProducts();
            closeModal(editModal);
        } catch (erro) {
            console.error("Erro ao atualizar produto:", erro);
            alert("Não foi possível salvar as alterações.");
        } finally {
            btnSave.disabled = false;
        }
    });

    btnDelete.addEventListener("click", async (event) => {
        event.preventDefault();

        const id = deleteModal.dataset.productId;
        if (!id) return;

        btnDelete.disabled = true;

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await loadProducts();
            closeModal(deleteModal);
        } catch (erro) {
            console.error("Erro ao excluir produto:", erro);
            alert("Não foi possível excluir o produto.");
        } finally {
            btnDelete.disabled = false;
        }
    });
}

/* ============================================================
   Inicialização da página de Produtos
   (chamada toda vez que o HTML da página é renderizado)
   ============================================================ */
function initProductsPage() {
    productsList = document.querySelector("#products-list");

    newColorsField = createColorsField({
        picker: document.getElementById("color-picker"),
        input: document.getElementById("color-input"),
        addBtn: document.getElementById("add-color"),
        list: document.getElementById("selected-colors"),
    });

    editColorsField = createColorsField({
        picker: document.getElementById("edit-color-picker"),
        input: document.getElementById("edit-color-input"),
        addBtn: document.getElementById("edit-add-color"),
        list: document.getElementById("edit-selected-colors"),
    });

    initImageUpload();
    initProductModal();
    initProductForm();
    initFilters();
    initActionModals();

    lucide.createIcons();
    loadProducts();
}

// Página inicial
productsPage();