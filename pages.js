const content = document.querySelector("#content");

const allLinks = document.querySelectorAll("a")
const productsLink = document.querySelector(".linkProducts")
const ordersLink = document.querySelector(".linkOrders")
const financeLink = document.querySelector(".linkFinance")

// Parcelas do cartão de crédito (1x = à vista)
const installmentsOptionsHtml = Array.from({ length: 12 }, (_, i) =>
    `<option value="${i + 1}">${i === 0 ? "À vista (1x)" : `${i + 1}x`}</option>`
).join("");

// Opções de forma de pagamento (opcional: a primeira opção é vazia)
const paymentOptionsHtml = `<option value="">Não informada</option>` + [
    ["pix", "Pix"],
    ["credito", "Cartão de crédito"],
    ["debito", "Cartão de débito"],
    ["dinheiro", "Dinheiro"],
].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

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

    <!-- Pergunta sobre exportação após salvar o pedido -->
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
                    <label for="order-product">Adicionar produtos *</label>
                    <div class="product-picker" id="product-picker">
                        <input type="text" id="order-product" placeholder="Buscar produto no catálogo ou digitar" maxlength="120" autocomplete="off">
                        <div class="picker-panel" id="picker-panel" hidden><div class="picker-grid" id="picker-grid"></div></div>
                    </div>
                    <div class="order-add-line">
                        <input type="number" id="order-quantity" min="1" step="1" value="1" aria-label="Quantidade a adicionar">
                        <input type="number" id="order-unit-price" min="0" step="0.01" placeholder="Preço un. (R$)" aria-label="Preço unitário a adicionar">
                        <button type="button" class="btn-cancel" id="order-add-product"><i data-lucide="plus"></i> Adicionar</button>
                    </div>
                    <div id="order-items" class="order-items"></div>
                </div>
                <div class="form-group">
                    <label for="order-price">Valor total (R$)</label>
                    <input type="number" id="order-price" readonly placeholder="0,00">
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="order-deadline">Prazo de entrega</label>
                        <input type="date" id="order-deadline">
                    </div>

                    <div class="form-group">
                        <label for="order-payment">Forma de pagamento</label>
                        <select id="order-payment">${paymentOptionsHtml}</select>
                    </div>
                </div>

                <div class="form-group" hidden>
                    <label for="order-installments">Parcelas</label>
                    <select id="order-installments">${installmentsOptionsHtml}</select>
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
<div class="modal-overlay" id="order-quote-modal" hidden>
    <div class="product-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="order-quote-title">
        <div class="confirm-body">
            <div class="confirm-icon"><i data-lucide="file-text"></i></div>
            <h2 id="order-quote-title">Pedido criado com sucesso!</h2>
            <p>Deseja exportar um PDF com o orçamento para enviar ao cliente?</p>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn-cancel" id="order-quote-no">Agora não</button>
            <button type="button" class="btn-primary" id="order-quote-yes"><i data-lucide="download"></i> Exportar PDF</button>
        </div>
    </div>
</div>

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

<!-- Modal de edição do pedido -->
<div class="modal-overlay" id="order-edit-modal" hidden>
    <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="order-edit-title">

        <div class="modal-header">
            <div>
                <h2 id="order-edit-title">Editar pedido</h2>
                <p>Altere as informações do pedido.</p>
            </div>
            <button type="button" class="icon-button" data-close-modal aria-label="Fechar">
                <i data-lucide="x"></i>
            </button>
        </div>

        <form id="order-edit-form">
            <div class="form-body">

                <div class="form-group">
                    <label for="edit-order-customer">Cliente *</label>
                    <input type="text" id="edit-order-customer" required maxlength="120">
                </div>

<div class="form-group">
                    <label for="edit-order-product">Adicionar produtos *</label>
                    <div class="product-picker" id="edit-product-picker">
                        <input type="text" id="edit-order-product" placeholder="Buscar produto no catálogo ou digitar" maxlength="120" autocomplete="off">
                        <div class="picker-panel" id="edit-picker-panel" hidden><div class="picker-grid" id="edit-picker-grid"></div></div>
                    </div>
                    <div class="order-add-line">
                        <input type="number" id="edit-order-quantity" min="1" step="1" value="1" aria-label="Quantidade a adicionar">
                        <input type="number" id="edit-order-unit-price" min="0" step="0.01" placeholder="Preço un. (R$)" aria-label="Preço unitário a adicionar">
                        <button type="button" class="btn-cancel" id="edit-order-add-product"><i data-lucide="plus"></i> Adicionar</button>
                    </div>
                    <div id="edit-order-items" class="order-items"></div>
                </div>
                <div class="form-group">
                    <label for="edit-order-price">Valor total (R$)</label>
                    <input type="number" id="edit-order-price" readonly placeholder="0,00">
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="edit-order-deadline">Prazo de entrega</label>
                        <input type="date" id="edit-order-deadline">
                    </div>

                    <div class="form-group">
                        <label for="edit-order-payment">Forma de pagamento</label>
                        <select id="edit-order-payment">${paymentOptionsHtml}</select>
                    </div>
                </div>

                <div class="form-group" hidden>
                    <label for="edit-order-installments">Parcelas</label>
                    <select id="edit-order-installments">${installmentsOptionsHtml}</select>
                </div>

                <div class="form-group">
                    <label for="edit-order-notes">Observações</label>
                    <textarea id="edit-order-notes" rows="3" maxlength="500"></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
                <button type="submit" class="btn-primary">
                    <i data-lucide="check"></i>
                    Salvar alterações
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Modal de detalhes do pedido -->
<div class="modal-overlay" id="order-detail-modal" hidden>
    <div class="product-modal order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">

        <div class="modal-header">
            <div>
                <span class="order-detail-number" id="order-detail-number"></span>
                <h2 id="order-detail-title"></h2>
                <p id="order-detail-created"></p>
            </div>
            <button type="button" class="icon-button" data-close-modal aria-label="Fechar">
                <i data-lucide="x"></i>
            </button>
        </div>

        <div class="form-body">
            <div class="order-detail-status">
                <span class="order-detail-badge" id="order-detail-status"></span>
                <span class="order-detail-overdue" id="order-detail-overdue" hidden>
                    <i data-lucide="alarm-clock"></i>Prazo vencido
                </span>
            </div>

            <dl class="order-detail-grid">
                <div class="order-detail-item">
                    <dt>Cliente</dt>
                    <dd id="order-detail-customer"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Produto</dt>
                    <dd id="order-detail-product"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Quantidade</dt>
                    <dd id="order-detail-quantity"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Valor total</dt>
                    <dd id="order-detail-price"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Prazo de entrega</dt>
                    <dd id="order-detail-deadline"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Etapa</dt>
                    <dd id="order-detail-stage"></dd>
                </div>
                <div class="order-detail-item">
                    <dt>Forma de pagamento</dt>
                    <dd id="order-detail-payment"></dd>
                </div>
            </dl>

            <div class="order-detail-item">
                <dt>Observações</dt>
                <dd class="order-detail-notes" id="order-detail-notes"></dd>
            </div>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn-cancel" data-close-modal>Fechar</button>
            <button type="button" class="btn-primary" id="order-detail-export-pdf">
                <i data-lucide="download"></i> Exportar PDF
            </button>
        </div>
    </div>
</div>
        `;
    lucide.createIcons();
    initOrdersPage();
}

function financePage() {
    removeClasses()
    financeLink.classList.add("active")

    content.innerHTML = `
<header class="page-header">
    <div>
        <h1>Financeiro</h1>
        <p>Receitas, despesas e lucro da V3D. Pedidos concluídos entram aqui automaticamente.</p>
    </div>

    <button type="button" class="btn-primary" id="new-finance-entry">
        <i data-lucide="plus"></i>
        Novo lançamento
    </button>
</header>

<!-- Indicadores do período -->
<section class="stats-grid">
    <div class="stat-card finance-income-card">
        <div class="stat-info">
            <span>Receitas</span>
            <h2 id="finance-income">R$ 0,00</h2>
        </div>
        <div class="stat-icon"><i data-lucide="trending-up"></i></div>
    </div>

    <div class="stat-card finance-expense-card">
        <div class="stat-info">
            <span>Despesas</span>
            <h2 id="finance-expense">R$ 0,00</h2>
        </div>
        <div class="stat-icon"><i data-lucide="trending-down"></i></div>
    </div>

    <div class="stat-card finance-profit-card" id="finance-profit-card">
        <div class="stat-info">
            <span>Lucro</span>
            <h2 id="finance-profit">R$ 0,00</h2>
        </div>
        <div class="stat-icon"><i data-lucide="wallet"></i></div>
    </div>
</section>

<!-- Lançamentos -->
<section class="products-section">
    <div class="section-header">
        <div>
            <h2>Lançamentos</h2>
            <p>Entradas e saídas do período selecionado.</p>
        </div>
    </div>

    <div class="filters">
        <div class="search-box">
            <i data-lucide="search"></i>
            <input type="search" id="finance-search" placeholder="Buscar lançamentos...">
        </div>

        <select id="finance-period" aria-label="Período">
            <option value="month">Este mês</option>
            <option value="last-month">Mês passado</option>
            <option value="year">Este ano</option>
            <option value="all">Todo o período</option>
        </select>

        <select id="finance-type-filter" aria-label="Tipo de lançamento">
            <option value="">Receitas e despesas</option>
            <option value="receita">Só receitas</option>
            <option value="despesa">Só despesas</option>
        </select>
    </div>

    <div id="finance-list"></div>

    <div class="table-footer">
        <span id="finance-count" role="status">0 lançamentos</span>
        <nav id="finance-pagination" class="finance-pagination" aria-label="Páginas dos lançamentos" hidden>
            <button type="button" class="btn-cancel" id="finance-previous-page" data-page-step="-1" disabled>Anterior</button>
            <span id="finance-page-status" role="status"></span>
            <button type="button" class="btn-cancel" id="finance-next-page" data-page-step="1">Próxima</button>
        </nav>
    </div>
</section>

<section class="products-section">
<div class="section-header"><div><h2>Parcelas dos pedidos</h2><p>Acompanhe os pagamentos dos pedidos no crédito, desde a criação. A receita entra no Financeiro quando o pedido é concluído.</p></div></div>
<div id="finance-order-installments" aria-live="polite"></div>
</section>
<div class="modal-overlay" id="installments-modal" hidden>
  <div class="product-modal" role="dialog" aria-modal="true" aria-label="Gerenciar parcelas">
    <div class="modal-header"><div><h2>Gerenciar parcelas</h2><p></p></div><button type="button" class="icon-button" data-close-installments aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="form-body" id="installments-list"></div>
  </div>
</div>
<!-- Modal de novo / editar lançamento -->
<div class="modal-overlay" id="finance-modal" hidden>
    <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="finance-modal-title">

        <div class="modal-header">
            <div>
                <h2 id="finance-modal-title">Novo lançamento</h2>
                <p>Registre uma despesa ou uma receita avulsa.</p>
            </div>
            <button type="button" class="icon-button" data-close-modal aria-label="Fechar">
                <i data-lucide="x"></i>
            </button>
        </div>

        <form id="finance-form">
            <div class="form-body">

                <div class="form-grid">
                    <div class="form-group">
                        <label for="finance-type">Tipo *</label>
                        <select id="finance-type" required>
                            <option value="despesa">Despesa</option>
                            <option value="receita">Receita</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="finance-category">Categoria *</label>
                        <select id="finance-category" required></select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="finance-description">Descrição *</label>
                    <input type="text" id="finance-description" placeholder="Ex: Filamento PLA preto 1kg"
                        required maxlength="255" autocomplete="off">
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="finance-amount">Valor (R$) *</label>
                        <input type="number" id="finance-amount" min="0.01" step="0.01" placeholder="0,00" required>
                    </div>

                    <div class="form-group">
                        <label for="finance-date">Data *</label>
                        <input type="date" id="finance-date" required>
                    </div>
                </div>

                <div class="form-group" id="finance-payment-group" hidden>
                    <label for="finance-payment">Forma de pagamento</label>
                    <select id="finance-payment">${paymentOptionsHtml}</select>
                </div>

                <div class="form-group" id="finance-installments-group" hidden>
                    <label for="finance-installments">Parcelas</label>
                    <select id="finance-installments">${installmentsOptionsHtml}</select>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
                <button type="submit" class="btn-primary">
                    <i data-lucide="check"></i>
                    Salvar lançamento
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Modal de confirmação de exclusão -->
<div class="modal-overlay" id="finance-delete-modal" hidden>
    <div class="product-modal confirm-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="finance-delete-title" aria-describedby="finance-delete-text">

        <div class="confirm-body">
            <div class="confirm-icon">
                <i data-lucide="trash-2"></i>
            </div>
            <h2 id="finance-delete-title">Excluir lançamento?</h2>
            <p id="finance-delete-text">Essa ação não pode ser desfeita. O valor deixa de contar no resumo.</p>
        </div>

        <div class="modal-footer">
            <button type="button" class="btn-cancel" data-close-modal>Cancelar</button>
            <button type="button" class="btn-danger" id="confirm-finance-delete">
                <i data-lucide="trash-2"></i>
                Excluir
            </button>
        </div>
    </div>
</div>
    `;
    lucide.createIcons();
    initFinancePage(); // definida no finance.js
}
