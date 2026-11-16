const content = document.querySelector("#content");

const allLinks = document.querySelectorAll("a")
const productsLink = document.querySelector(".linkProducts")
const ordersLink = document.querySelector(".linkOrders")

function removeClasses() {
    allLinks.forEach(link => {
        link.classList.remove("active")
    });
}

const productsTemplate = `
<header class="page-header">
    <div>
        <h1>Produtos</h1>
        <p>Gerencie o catálogo de produtos da V3D.</p>
    </div>

    <button class="btn-primary" id="new-product">
        <i data-lucide="plus"></i>
        Novo produto
    </button>
</header>

<!-- Indicadores -->
<section class="stats-grid">
    <div class="stat-card">
        <div class="stat-info">
            <span>Total de produtos</span>
            <h2 id="total-products">0</h2>
        </div>
        <div class="stat-icon"><i data-lucide="package"></i></div>
    </div>

    <div class="stat-card">
        <div class="stat-info">
            <span>Categorias</span>
            <h2 id="active-products">0</h2>
        </div>
        <div class="stat-icon"><i data-lucide="layers"></i></div>
    </div>

    <div class="stat-card">
        <div class="stat-info">
            <span>Sem imagem</span>
            <h2 id="low-stock">0</h2>
        </div>
        <div class="stat-icon"><i data-lucide="image-off"></i></div>
    </div>
</section>

<!-- Catálogo -->
<section class="products-section">
    <div class="section-header">
        <div>
            <h2>Catálogo de produtos</h2>
            <p>Visualize e organize seus produtos.</p>
        </div>
    </div>

    <!-- Filtros -->
    <div class="filters">
        <div class="search-box">
            <i data-lucide="search"></i>
            <input type="search" id="search-products" placeholder="Buscar produtos...">
        </div>

        <select id="category-filter">
            <option value="">Todas as categorias</option>
            <option value="Decoração">Decoração</option>
            <option value="Chaveiros">Chaveiros</option>
            <option value="Personalizados">Personalizados</option>
        </select>

        <select id="status-filter">
            <option value="">Todos os status</option>
            <option value="Ativo">Ativos</option>
            <option value="Inativo">Inativos</option>
        </select>
    </div>

    <!-- Cards -->
    <div id="products-list" class="products-grid">
        <!-- Cards inseridos pelo JS -->
    </div>

    <div class="table-footer">
        <span id="products-count">0 produtos encontrados</span>
    </div>

    <!-- Modal de novo produto -->
    <div class="modal-overlay" id="product-modal" hidden>
        <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">

            <div class="modal-header">
                <div>
                    <h2 id="modal-title">Novo produto</h2>
                    <p>Preencha as informações do produto.</p>
                </div>
                <button type="button" id="close-modal" class="icon-button" aria-label="Fechar">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <form id="product-form">
                <div class="form-body">

                    <div class="form-group">
                        <label for="product-name">Nome do produto *</label>
                        <input type="text" id="product-name" placeholder="Ex: Chaveiro personalizado" required
                            maxlength="120">
                    </div>

                    <div class="form-group">
                        <label for="product-description">Descrição</label>
                        <textarea id="product-description" placeholder="Descreva o produto..." rows="3"></textarea>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="product-category">Categoria *</label>
                            <select id="product-category" required>
                                <option value="">Selecione</option>
                                <option value="Chaveiros">Chaveiros</option>
                                <option value="Decoração">Decoração</option>
                                <option value="Personalizados">Personalizados</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="product-price">Preço (R$) *</label>
                            <input type="number" id="product-price" min="0" step="0.01" placeholder="0,00" required>
                        </div>

                        <div class="form-group">
                            <label for="product-size">Tamanho</label>
                            <input type="text" id="product-size" placeholder="Ex: 10 x 5 cm" maxlength="60">
                        </div>

                        <div class="form-group">
                            <label for="product-material">Material</label>
                            <input type="text" id="product-material" placeholder="Ex: PLA, PETG" maxlength="60">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="color-input">Cores disponíveis</label>

                        <div class="color-input-row">
                            <input type="color" id="color-picker" value="#16A34A" aria-label="Escolher cor">
                            <input type="text" id="color-input"
                                placeholder="Nome ou código (ex: Vermelho ou #FF0000)" maxlength="40">
                            <button type="button" id="add-color" class="btn-cancel">Adicionar</button>
                        </div>

                        <div id="selected-colors" class="selected-colors"></div>
                    </div>

                    <div class="form-group">
                        <label for="product-image">Imagem do produto</label>
                        <label class="upload-area" id="upload-area" for="product-image">
                            <i data-lucide="image-plus"></i>
                            <strong>Selecionar imagem</strong>
                            <span>Arraste uma imagem ou clique para selecionar</span>

                            <input type="file" id="product-image" accept="image/png,image/jpeg,image/webp" hidden>
                        </label>

                        <img id="image-preview" alt="Prévia do produto" hidden>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn-cancel" id="cancel-product">Cancelar</button>
                    <button type="submit" class="btn-primary" id="save-product">
                        <i data-lucide="check"></i>
                        Salvar produto
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal de edição -->
    <div class="modal-overlay" id="edit-modal" hidden>
        <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">

            <div class="modal-header">
                <div>
                    <h2 id="edit-modal-title">Editar produto</h2>
                    <p>Altere as informações do produto.</p>
                </div>
                <button type="button" class="icon-button" data-close-modal aria-label="Fechar">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <form id="edit-form">
                <div class="form-body">

                    <div class="form-group">
                        <label for="edit-name">Nome do produto *</label>
                        <input type="text" id="edit-name" required maxlength="120">
                    </div>

                    <div class="form-group">
                        <label for="edit-description">Descrição</label>
                        <textarea id="edit-description" rows="3"></textarea>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="edit-category">Categoria *</label>
                            <select id="edit-category" required>
                                <option value="">Selecione</option>
                                <option value="Chaveiros">Chaveiros</option>
                                <option value="Decoração">Decoração</option>
                                <option value="Personalizados">Personalizados</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="edit-price">Preço (R$)</label>
                            <input type="number" id="edit-price" min="0" step="0.01" placeholder="0,00">
                        </div>

                        <div class="form-group">
                            <label for="edit-size">Tamanho</label>
                            <input type="text" id="edit-size" maxlength="60">
                        </div>

                        <div class="form-group">
                            <label for="edit-material">Material</label>
                            <input type="text" id="edit-material" maxlength="60">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="edit-color-input">Cores disponíveis</label>

                        <div class="color-input-row">
                            <input type="color" id="edit-color-picker" value="#16A34A" aria-label="Escolher cor">
                            <input type="text" id="edit-color-input"
                                placeholder="Nome ou código (ex: Vermelho ou #FF0000)" maxlength="40">
                            <button type="button" id="edit-add-color" class="btn-cancel">Adicionar</button>
                        </div>

                        <div id="edit-selected-colors" class="selected-colors"></div>
                    </div>

                    <div class="form-group">
                        <label for="edit-image">Imagem do produto</label>
                        <label class="upload-area" for="edit-image">
                            <i data-lucide="image-plus"></i>
                            <strong>Trocar imagem</strong>
                            <span>Clique para selecionar</span>
                            <input type="file" id="edit-image" accept="image/png,image/jpeg,image/webp" hidden>
                        </label>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
                    <button type="button" class="btn-primary" id="save-edit">
                        <i data-lucide="check"></i>
                        Salvar alterações
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal de confirmação de exclusão -->
    <div class="modal-overlay" id="delete-modal" hidden>
        <div class="product-modal confirm-modal" role="alertdialog" aria-modal="true"
            aria-labelledby="delete-modal-title" aria-describedby="delete-modal-text">

            <div class="confirm-body">
                <div class="confirm-icon">
                    <i data-lucide="trash-2"></i>
                </div>
                <h2 id="delete-modal-title">Excluir produto?</h2>
                <p id="delete-modal-text">Essa ação não pode ser desfeita. O produto será removido do catálogo.</p>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
                <button type="button" class="btn-danger" id="confirm-delete">
                    <i data-lucide="trash-2"></i>
                    Excluir
                </button>
            </div>
        </div>
    </div>
</section>
`;

function productsPage() {
    removeClasses()
    productsLink.classList.add("active")

    content.innerHTML = productsTemplate;
    initProductsPage(); // definida no app.js
}

function ordersPage() {
    removeClasses()
    ordersLink.classList.add("active")

    content.innerHTML = `
<header class="page-header">
    <div>
        <h1>Pedidos</h1>
        <p>Arraste os pedidos entre as etapas para acompanhar a produção.</p>
    </div>

    <button type="button" class="btn-primary" id="new-order">
        <i data-lucide="plus"></i>
        Novo pedido
    </button>
</header>

<!-- Quadro -->
<section class="orders-board" id="orders-board">
    <div class="order-column" data-status="aguardando">
        <div class="column-header">
            <div class="column-title">
                <span class="column-dot"></span>
                <h2>Aguardando</h2>
            </div>
            <span class="column-count">0</span>
        </div>
        <div class="order-list" data-status="aguardando"></div>
    </div>

    <div class="order-column" data-status="imprimindo">
        <div class="column-header">
            <div class="column-title">
                <span class="column-dot"></span>
                <h2>Imprimindo</h2>
            </div>
            <span class="column-count">0</span>
        </div>
        <div class="order-list" data-status="imprimindo"></div>
    </div>

    <div class="order-column" data-status="finalizacao">
        <div class="column-header">
            <div class="column-title">
                <span class="column-dot"></span>
                <h2>Finalização</h2>
            </div>
            <span class="column-count">0</span>
        </div>
        <div class="order-list" data-status="finalizacao"></div>
    </div>

    <div class="order-column" data-status="concluido">
        <div class="column-header">
            <div class="column-title">
                <span class="column-dot"></span>
                <h2>Concluído</h2>
            </div>
            <span class="column-count">0</span>
        </div>
        <div class="order-list" data-status="concluido"></div>
    </div>
</section>

<!-- Modal de novo pedido -->
<div class="modal-overlay" id="order-modal" hidden>
    <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">

        <div class="modal-header">
            <div>
                <h2 id="order-modal-title">Novo pedido</h2>
                <p>O pedido entra na coluna Aguardando.</p>
            </div>
            <button type="button" class="icon-button" data-close-modal aria-label="Fechar">
                <i data-lucide="x"></i>
            </button>
        </div>

        <form id="order-form">
            <div class="form-body">

                <div class="form-group">
                    <label for="order-customer">Cliente *</label>
                    <input type="text" id="order-customer" placeholder="Nome do cliente" required maxlength="120">
                </div>

                <div class="form-group">
                    <label for="order-product">Produto *</label>
                    <div class="product-picker" id="product-picker">
                        <input type="text" id="order-product"
                            placeholder="Clique para escolher ou digite" required maxlength="120" autocomplete="off">

                        <div class="picker-panel" id="picker-panel" hidden>
                            <div class="picker-grid" id="picker-grid"></div>
                        </div>
                    </div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="order-quantity">Quantidade *</label>
                        <input type="number" id="order-quantity" min="1" step="1" value="1" required>
                    </div>

                    <div class="form-group">
                        <label for="order-price">Valor total (R$)</label>
                        <input type="number" id="order-price" min="0" step="0.01" placeholder="0,00">
                    </div>
                </div>

                <div class="form-group">
                    <label for="order-deadline">Prazo de entrega</label>
                    <input type="date" id="order-deadline">
                </div>

                <div class="form-group">
                    <label for="order-notes">Observações</label>
                    <textarea id="order-notes" rows="3" maxlength="500"
                        placeholder="Cor, tamanho, detalhes da personalização..."></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
                <button type="submit" class="btn-primary">
                    <i data-lucide="check"></i>
                    Criar pedido
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Modal de confirmação de exclusão -->
<div class="modal-overlay" id="order-delete-modal" hidden>
    <div class="product-modal confirm-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="order-delete-title" aria-describedby="order-delete-text">

        <div class="confirm-body">
            <div class="confirm-icon">
                <i data-lucide="trash-2"></i>
            </div>
            <h2 id="order-delete-title">Excluir pedido?</h2>
            <p id="order-delete-text">Essa ação não pode ser desfeita. O pedido será removido do quadro.</p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
            <button type="button" class="btn-danger" id="confirm-order-delete">
                <i data-lucide="trash-2"></i>
                Excluir
            </button>
        </div>
    </div>
</div>
        `;
    lucide.createIcons();
    initOrdersPage();
}