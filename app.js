lucide.createIcons();

const themeToggle = document.getElementById("theme-toggle");
const html = document.documentElement;

// Recuperar tema salvo
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

// Atualizar botão inicialmente
updateThemeButton();

// Alternar tema ao clicar
themeToggle.addEventListener("click", () => {
    const currentTheme = html.getAttribute("data-theme");

    const newTheme = currentTheme === "dark" ? "light" : "dark";

    html.setAttribute("data-theme", newTheme);
    localStorage.setItem("v3d-theme", newTheme);

    updateThemeButton();
});


function initProductModal() {
    const modal = document.getElementById("product-modal");
    const openBtn = document.getElementById("new-product");
    const closeBtn = document.getElementById("close-modal");
    const cancelBtn = document.getElementById("cancel-product");

    if (!modal || !openBtn) return;

    // Abrir modal
    openBtn.addEventListener("click", () => {
        modal.hidden = false;
    });

    // Fechar modal
    const closeModal = () => {
        modal.hidden = true;
    };

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    // Fechar clicando fora do modal
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}


function initImageUpload() {
    const uploadArea = document.getElementById("upload-area");
    const imageInput = document.getElementById("product-image");
    const preview = document.getElementById("image-preview");

    if (!uploadArea || !imageInput || !preview) return;

    let previewUrl = null;

    function showImage(file) {
        if (!file) return;

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            alert("Selecione uma imagem PNG, JPG ou WebP.");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            alert("A imagem deve ter no máximo 2 MB.");
            return;
        }

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
    }

    // Seleção normal pelo explorador de arquivos
    imageInput.addEventListener("change", () => {
        showImage(imageInput.files[0]);
    });

    // Detectar imagem arrastada sobre a área
    uploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";

        uploadArea.classList.add("dragging");
    });

    // Remover destaque quando sair da área
    uploadArea.addEventListener("dragleave", (event) => {
        if (!uploadArea.contains(event.relatedTarget)) {
            uploadArea.classList.remove("dragging");
        }
    });

    // Receber imagem quando soltar
    uploadArea.addEventListener("drop", (event) => {
        event.preventDefault();

        uploadArea.classList.remove("dragging");

        const file = event.dataTransfer.files[0];

        if (!file) return;

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type) ||
            file.size > 2 * 1024 * 1024) {
            showImage(file);
            return;
        }

        // Atualizar o input com o arquivo arrastado
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;

        showImage(file);
    });
}

let selectedColors = [];

function renderColorChips() {
    const list = document.getElementById("selected-colors");

    list.innerHTML = selectedColors.map((cor, i) => `
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

function initColorsInput() {
    const picker = document.getElementById("color-picker");
    const input = document.getElementById("color-input");
    const addBtn = document.getElementById("add-color");
    const list = document.getElementById("selected-colors");

    if (!picker || !input || !addBtn || !list) return;

    function addColor(value) {
        const cor = value.trim();
        if (!cor) return;

        const jaExiste = selectedColors.some(c => c.toLowerCase() === cor.toLowerCase());
        if (jaExiste) return;

        selectedColors.push(cor);
        input.value = "";
        renderColorChips();
    }

    // O seletor de cor preenche o campo com o código hex
    picker.addEventListener("input", () => {
        input.value = picker.value;
    });

    addBtn.addEventListener("click", () => addColor(input.value));

    // Enter adiciona a cor sem enviar o formulário
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addColor(input.value);
        }
    });

    // Remover cor pelo "x" do chip
    list.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-index]");
        if (!btn) return;

        selectedColors.splice(Number(btn.dataset.index), 1);
        renderColorChips();
    });
}

initImageUpload();
initProductModal();
initColorsInput();

const productsList = document.querySelector("#products-list");
let allProducts = [];

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

const IMAGES_PATH = "assets/products/";

function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "Sob consulta";

    return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function renderProducts(produtos) {
    if (!produtos.length) {
        productsList.innerHTML = `<p class="products-empty">Nenhum produto encontrado.</p>`;
    } else {
        productsList.innerHTML = produtos.map((produto, index) => {
            const cores = parseColors(produto.colors);

            return `
                <article class="product-card" data-id="${produto.id}" style="--i:${Math.min(index, 12)}">
                    <div class="product-image">
                        ${produto.image
                    ? `<img src="${IMAGES_PATH}${escapeHtml(produto.image)}" alt="${escapeHtml(produto.name)}" loading="lazy">`
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
        new Set(produtos.map(p => p.category)).size;
    document.getElementById("low-stock").textContent =
        produtos.filter(p => !p.image).length;
}

function applyFilters() {
    const search = document.getElementById("search-products").value.toLowerCase().trim();
    const category = document.getElementById("category-filter").value;

    const filtered = allProducts.filter(p => {
        const matchSearch = (p.name || "").toLowerCase().includes(search);
        const matchCategory = !category || p.category === category;
        return matchSearch && matchCategory;
    });

    renderProducts(filtered);
}

async function loadProducts() {
    try {
        const resposta = await fetch("http://localhost:5000/api/produtos");
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const dados = await resposta.json();
        allProducts = Array.isArray(dados) ? dados : (dados.produtos || dados.data || []);

        updateStats(allProducts);
        renderProducts(allProducts);
    } catch (erro) {
        console.error("Erro ao carregar produtos:", erro);
        productsList.innerHTML = `<p class="products-empty">Não foi possível carregar os produtos.</p>`;
    }
}

async function getAllProducts() {
    try {
        const response = await fetch("http://localhost:5000/api/produtos");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const dados = await response.json();
        allProducts = Array.isArray(dados) ? dados : (dados.produtos || dados.data || []);

        return allProducts;
    } catch (erro) {
        console.error("Erro ao carregar produtos:", erro);
        return [];
    }
}

["search-products", "category-filter"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFilters);
});

loadProducts();

// Adicionar produtos
let productForm = document.querySelector("#product-form")

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
    formData.append("colors", JSON.stringify(selectedColors));

    if (imageFile) {
        formData.append("image", imageFile);
    }

    try {
        const resposta = await fetch("http://localhost:5000/api/produtos", {
            method: "POST",
            body: formData   // não coloque Content-Type: o navegador define sozinho
        });

        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        // Limpar e fechar
        productForm.reset();
        selectedColors = [];
        renderColorChips();
        document.getElementById("image-preview").hidden = true;
        document.getElementById("product-modal").hidden = true;

        loadProducts(); // recarrega os cards
    } catch (erro) {
        console.error("ERRO NO POST:", erro);
        alert("Não foi possível salvar o produto.");
    }
});

// Modais de editar e excluir (apenas abrir e fechar)
function initActionModals() {
    const editModal = document.getElementById("edit-modal");
    const deleteModal = document.getElementById("delete-modal");

    if (!editModal || !deleteModal) return;

    const nameInput = document.querySelector("#edit-name");
    const description = document.querySelector("#edit-description");
    const price = document.querySelector("#edit-price");
    const category = document.querySelector("#edit-category");
    const size = document.querySelector("#edit-size");
    const material = document.querySelector("#edit-material");
    const colorInput = document.querySelector("#edit-color-input");
    const btnSave = document.querySelector("#save-edit");
    const btnDelete = document.querySelector("#confirm-delete")


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
        // colors vem como JSON; mostra separado por vírgula: "#16A34A, Vermelho"
        colorInput.value = parseColors(produto.colors).join(", ");

        editModal.hidden = false;
    }

    function openDeleteModal(productId) {
        deleteModal.dataset.productId = productId;
        deleteModal.hidden = false;
    }

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

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        [editModal, deleteModal].forEach((modal) => closeModal(modal));
    });

    btnSave.addEventListener("click", async (event) => {
        event.preventDefault();

        const id = editModal.dataset.productId;
        if (!id) return;

        // Mesmo formato do POST: array em JSON
        const colors = colorInput.value
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);

        const formData = new FormData();
        formData.append("name", nameInput.value.trim());
        formData.append("desc", description.value.trim());
        formData.append("price", price.value);
        formData.append("category", category.value);
        formData.append("size", size.value.trim());
        formData.append("material", material.value.trim());
        formData.append("colors", JSON.stringify(colors));

        const imageInput = document.querySelector("#edit-image");
        if (imageInput && imageInput.files[0]) {
            formData.append("image", imageInput.files[0]);
        }

        btnSave.disabled = true;

        try {
            const response = await fetch(`http://localhost:5000/api/produtos/${id}`, {
                method: "PUT",
                body: formData,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await loadProducts(); // recarrega allProducts, cards e estatísticas
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
            const response = await fetch(`http://localhost:5000/api/produtos/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await loadProducts(); // recarrega allProducts, cards e estatísticas
            closeModal(deleteModal);
        } catch (erro) {
            console.error("Erro ao excluir produto:", erro);
            alert("Não foi possível salvar as alterações.");
        } finally {
            btnDelete.disabled = false;
        }
    });
}

initActionModals();