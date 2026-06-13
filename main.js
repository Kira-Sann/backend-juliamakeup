
/*************************
 * DADOS E ESTADO
 *************************/
let products = [];
let filteredProducts = [];
let productsLoadPromise = null;
let currentTab = "all";
let currentPage = 1;
let searchTerm = "";
let sortMode = "featured";
const itemsPerPage = 10;
const LOCAL_API_URL = "http://localhost:3001";
const REMOTE_API_URL = "https://backend-juliamakeup.onrender.com";
let API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? LOCAL_API_URL
    : REMOTE_API_URL;
const THEME_STORAGE_KEY = "theme";

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let favorites = (JSON.parse(localStorage.getItem("favorites")) || []).map(Number);
let pendingCheckoutMessage = "";

function toBoolean(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function toOptionalNumber(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function hasValidOldPrice(product) {
    return Boolean(product.oldPrice && product.oldPrice > product.price);
}

function isFeaturedProduct(product) {
    return Boolean(product.featured || hasValidOldPrice(product));
}

function isSaleProduct(product) {
    return Boolean(product.isSale || hasValidOldPrice(product));
}

function normalizeImageList(value) {
    if (!value) return [];

    const raw = Array.isArray(value) ? value : [value];
    return raw.flatMap((item) => {
        if (!item) return [];
        if (typeof item === "string") {
            try {
                const parsed = JSON.parse(item);
                if (Array.isArray(parsed)) return parsed;
            } catch (err) {
                // keep raw string
            }
            return [item];
        }

        return [item];
    }).map((item) => String(item).trim()).filter(Boolean);
}

function mergeImageLists(...values) {
    return [...new Set(values.flatMap((value) => normalizeImageList(value)))];
}

function getProductImage(product) {
    const images = mergeImageLists(product.images, product.image);
    return images[0] || product.image || "img/julia_logo.png";
}

async function fetchWithApiFallback(path, options) {
    const primaryUrl = `${API_URL}${path}`;

    try {
        const response = await fetch(primaryUrl, options);
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response;
    } catch (error) {
        const canFallback = API_URL === LOCAL_API_URL;
        if (!canFallback) throw error;

        API_URL = REMOTE_API_URL;
        const fallbackResponse = await fetch(`${API_URL}${path}`, options);
        if (!fallbackResponse.ok) throw new Error(`API respondeu ${fallbackResponse.status}`);
        return fallbackResponse;
    }
}

function getDisplayTotal() {
    return filteredProducts.length;
}

function updateResultsSummary() {
    const summary = document.getElementById("results-summary");
    if (!summary) return;

    const total = filteredProducts.length;
    const label = total === 1 ? "produto encontrado" : "produtos encontrados";
    summary.textContent = `${total} ${label}`;
}

function formatMoney(value) {
    return `R$ ${Number(value || 0).toFixed(2)}`;
}

function getPreferredTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    const themeToggle = document.getElementById("theme-toggle");

    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

    if (themeToggle) {
        const icon = themeToggle.querySelector("i");
        const isDark = nextTheme === "dark";

        themeToggle.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
        themeToggle.setAttribute("title", isDark ? "Modo claro" : "Modo escuro");

        if (icon) {
            icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
        }
    }
}

function setupThemeToggle() {
    const themeToggle = document.getElementById("theme-toggle");
    applyTheme(getPreferredTheme());

    if (!themeToggle) return;

    themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
        applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
}

function setActiveFilter(tab) {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

function resetFilters() {
    currentTab = "all";
    currentPage = 1;
    searchTerm = "";
    sortMode = "featured";

    const input = document.getElementById("search-input");
    const select = document.getElementById("sort-select");
    const minInput = document.getElementById("price-min");
    const maxInput = document.getElementById("price-max");
    const onlyStockInput = document.getElementById("only-stock");
    const advancedToggle = document.getElementById("toggle-advanced-filters");
    const advancedPanel = document.getElementById("advanced-filters");

    if (input) input.value = "";
    if (select) select.value = sortMode;
    if (minInput) minInput.value = "";
    if (maxInput) maxInput.value = "";
    if (onlyStockInput) onlyStockInput.checked = false;
    if (advancedPanel) advancedPanel.classList.remove("open");
    if (advancedToggle) advancedToggle.setAttribute("aria-expanded", "false");

    setActiveFilter("all");
    applyFilterAndRender();
}

/*************************
 * API
 *************************/
function normalizeStoreProducts(data = []) {
    const normalized = data.map(p => ({
        ...p,
        id: Number(p.id),
        stock: Number(p.stock) || 0,
        inStock: Number(p.stock) > 0,
        price: Number(p.price) || 0,
        oldPrice: toOptionalNumber(p.oldPrice),
        category: normalizeText(p.category || ""),
        isNew: toBoolean(p.isNew),
        isSale: toBoolean(p.isSale),
        featured: toBoolean(p.featured)
    }));

    return normalized.map(p => ({
        ...p,
        isSale: isSaleProduct(p),
        featured: isFeaturedProduct(p)
    }));
}

async function loadProducts() {
    if (productsLoadPromise) return productsLoadPromise;

    productsLoadPromise = (async () => {
    try {
        const res = await fetchWithApiFallback(`/products?nocache=${Date.now()}`);
;
        const data = await res.json();

        // 🔑 NORMALIZA TUDO AQUI
        products = normalizeStoreProducts(data);
        /*
            ...p,
            id: Number(p.id),                 // 👈 ESSENCIAL
            stock: Number(p.stock) || 0,
            inStock: Number(p.stock) > 0,
            price: Number(p.price) || 0,
            oldPrice: toOptionalNumber(p.oldPrice),
            category: normalizeText(p.category || ""),
            isNew: toBoolean(p.isNew),
            isSale: toBoolean(p.isSale),
            featured: toBoolean(p.featured)
        }));

        products = products.map(p => ({
            isSale: isSaleProduct(p),
            featured: isFeaturedProduct(p)
        }));

        */

        applyFilterAndRender();
        updateFavoritesCount();
        updateCartCount();
        return products;

    } catch (err) {
        console.error("Erro ao carregar produtos", err);
        productsLoadPromise = null;
        return [];
    }
    })();

    return productsLoadPromise;
}

document.addEventListener("DOMContentLoaded", () => {
    setupThemeToggle();
    const hasProductGrid = Boolean(document.getElementById("products-container"));

    if (hasProductGrid) {
        loadProducts();
        setupSearch();
        setupFilters();
    }

    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    if (typeof setupCartEvents === "function") setupCartEvents();
    if (typeof setupFavoritesEvents === "function") setupFavoritesEvents();
    updateFavoritesCount();
    updateCartCount();
});

//pesquisa 
function setupSearch() {
    const input = document.getElementById("search-input");
    if (!input) return;

    input.addEventListener("input", () => {
        searchTerm = input.value.trim();

        if (searchTerm.length < 2) {
            searchTerm = "";
        }

        currentPage = 1;
        applyFilterAndRender();
    });
}


function normalizeText(text = "") {
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(product, search) {
    if (!search) return true;

    const words = normalizeText(search)
        .split(" ")
        .filter(w => w.length >= 2);

    const name = normalizeText(product.name);
    const shortDesc = normalizeText(product.shortDescription || "");

    return words.every(w => name.includes(w) || shortDesc.includes(w)
    );
}

function sortProducts(list) {
    const items = [...list];

    switch (sortMode) {
        case "price-asc":
            return items.sort((a, b) => a.price - b.price);
        case "price-desc":
            return items.sort((a, b) => b.price - a.price);
        case "newest":
            return items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || Number(b.featured) - Number(a.featured));
        case "stock":
            return items.sort((a, b) => b.stock - a.stock);
        case "featured":
        default:
            return items.sort((a, b) =>
                Number(isFeaturedProduct(b)) - Number(isFeaturedProduct(a)) ||
                Number(isSaleProduct(b)) - Number(isSaleProduct(a)) ||
                b.stock - a.stock ||
                a.price - b.price
            );
    }
}

function readAdvancedFilters() {
    const minInput = document.getElementById("price-min");
    const maxInput = document.getElementById("price-max");
    const onlyStockInput = document.getElementById("only-stock");

    const minPrice = minInput && minInput.value !== "" ? Number(minInput.value) : null;
    const maxPrice = maxInput && maxInput.value !== "" ? Number(maxInput.value) : null;

    return {
        minPrice: Number.isFinite(minPrice) ? minPrice : null,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
        onlyStock: Boolean(onlyStockInput && onlyStockInput.checked)
    };
}

function matchesAdvancedFilters(product) {
    const { minPrice, maxPrice, onlyStock } = readAdvancedFilters();

    if (minPrice !== null && product.price < minPrice) return false;
    if (maxPrice !== null && product.price > maxPrice) return false;
    if (onlyStock && product.stock <= 0) return false;

    return true;
}

function applyFilterAndRender() {
    let temp = [...products];

    if (currentTab === "featured") temp = temp.filter(p => p.featured);
    else if (currentTab === "new") temp = temp.filter(p => p.isNew);
    else if (currentTab === "promo") temp = temp.filter(p => p.isSale);
    else if (currentTab !== "all") temp = temp.filter(p => p.category === currentTab);

    if (searchTerm.length >= 2) {
        temp = temp.filter(p => matchesSearch(p, searchTerm));
    }

    temp = temp.filter(matchesAdvancedFilters);

    filteredProducts = sortProducts(temp);
    renderProducts();
    renderPagination();
    updateResultsSummary();
}

function setupFilters() {
    const buttons = document.querySelectorAll(".filter-btn");
    if (!buttons.length) return;

    buttons.forEach(button => {
        button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");

        button.addEventListener("click", () => {
            buttons.forEach(btn => {
                const active = btn === button;
                btn.classList.toggle("active", active);
                btn.setAttribute("aria-pressed", active ? "true" : "false");
            });

            currentTab = button.dataset.tab || "all";
            currentPage = 1;
            applyFilterAndRender();
        });
    });

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.value = sortMode;
        sortSelect.addEventListener("change", () => {
            sortMode = sortSelect.value;
            currentPage = 1;
            applyFilterAndRender();
        });
    }

    const resetBtn = document.getElementById("reset-filters");
    if (resetBtn) {
        resetBtn.addEventListener("click", resetFilters);
    }

    const advancedToggle = document.getElementById("toggle-advanced-filters");
    const advancedPanel = document.getElementById("advanced-filters");
    if (advancedToggle && advancedPanel) {
        advancedToggle.addEventListener("click", () => {
            advancedPanel.classList.toggle("open");
            advancedToggle.setAttribute("aria-expanded", advancedPanel.classList.contains("open") ? "true" : "false");
        });
        advancedToggle.setAttribute("aria-expanded", "false");
    }

    const advancedInputs = [
        document.getElementById("price-min"),
        document.getElementById("price-max"),
        document.getElementById("only-stock")
    ].filter(Boolean);

    advancedInputs.forEach((input) => {
        const eventName = input.type === "checkbox" ? "change" : "input";
        input.addEventListener(eventName, () => {
            currentPage = 1;
            applyFilterAndRender();
        });
    });
}

function renderProducts() {
    const container = document.getElementById("products-container");
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredProducts.slice(start, end);

    if (!pageItems.length) {
        const hasQuery = searchTerm.length >= 2;
        const hasFilter = currentTab !== "all" || sortMode !== "featured";
        const title = hasQuery || hasFilter ? "Nenhum resultado por aqui" : "Nenhum produto disponível";
        const message = hasQuery
            ? `Nao encontramos nada para "${searchTerm}". Tente outro termo ou limpe os filtros.`
            : hasFilter
                ? "Esse filtro nao trouxe produtos agora. Vale tentar outra categoria ou outra ordenacao."
                : "Ainda nao existem produtos para mostrar.";

        container.innerHTML = `
            <div class="empty-state-card">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="empty-state-actions">
                    <button type="button" class="reset-filters-btn" onclick="resetFilters()">Limpar filtros</button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = pageItems.map(p => `
        <div class="product-card">
            <div class="product-image-container">
                <img 
                    src="${getProductImage(p)}" 
                    alt="${p.name}" 
                    class="product-image"
                    onerror="this.onerror=null;this.src='img/julia_logo.png';"
                    onclick="openProductModal(${p.id})"
                />
                <div class="product-badges">
                    ${isFeaturedProduct(p) ? `<span class="badge badge-featured">Destaque</span>` : ""}
                    ${p.isNew ? `<span class="badge badge-new">Novo</span>` : ""}
                    ${isSaleProduct(p) ? `<span class="badge badge-sale">Promoção</span>` : ""}
                </div>
               <button class="heart-btn" data-id="${p.id}">
                    <i class="fa-solid fa-heart ${favorites.includes(p.id) ? "active" : ""}"></i>
                </button>
                ${p.stock > 0 && p.stock <= 3 ? `<span class="low-stock-label">Ultimas unidades</span>` : ""}
            </div>

            <div class="product-info">
                <h3>${p.name}</h3>

                <div class="price-container">
                    ${hasValidOldPrice(p) ? `<span class="original-price">R$ ${p.oldPrice.toFixed(2)}</span>` : ""}
                    <span class="current-price">R$ ${p.price.toFixed(2)}</span>
                </div>
                ${p.stock > 0
            ? `<div class="product-actions">
                    <button class="add-to-cart-btn product-cart-icon-btn" onclick="addToCart(${p.id})" aria-label="Adicionar ao carrinho" title="Adicionar ao carrinho">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    <button class="buy-now-card-btn" onclick="buyNow(${p.id})">Comprar agora</button>
                </div>`
            : `<button class="out-of-stock-btn" disabled>Fora de estoque</button>`
        }
                <button class="details-btn" onclick="window.location.href='product.html?id=${p.id}'">Ver detalhes</button>
            </div>
        </div>
    `).join("");
}

document.addEventListener("click", (e) => {
    const btn = e.target.closest(".heart-btn");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const productId = Number(btn.dataset.id);

    // 🔹 Atualiza estado
    toggleFavorite(productId);

    // 🔹 Atualiza APENAS o botão clicado (visual imediato)
    btn.classList.toggle("active", favorites.includes(productId));
});


async function updateProductStock(productId, delta) {
    const res = await fetchWithApiFallback(`/products/${productId}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar estoque");
    }

    const index = products.findIndex(p => p.id === productId);
    if (index !== -1) {
        products[index] = {
            ...products[index],
            ...data,
            id: Number(data.id ?? products[index].id),
            stock: Number(data.stock) || 0
        };
        products[index].inStock = products[index].stock > 0;
    }

    return data;
}

async function addToCart(productId, options = {}) {
    const product = products.find(p => p.id === productId);

    if (!product || product.stock <= 0) {
        showToast("Produto fora de estoque");
        return false;
    }

    try {
        const existing = cart.find(item => item.id === productId);

        if (existing) {
            if (existing.quantity >= product.stock) {
                showToast("Estoque insuficiente");
                return false;
            }
            existing.quantity += 1;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                image: getProductImage(product),
                quantity: 1
            });
        }

        saveCart();
        updateCartCount();
        if (!options.silentToast) {
            showToast("Produto adicionado ao carrinho");
        }
        updateCartDisplay();
        applyFilterAndRender();
        return true;
    } catch (err) {
        console.error(err);
        showToast(err.message || "Erro ao adicionar produto");
        return false;
    }
}

async function buyNow(productId) {
    const product = products.find(p => p.id === productId);

    if (!product || product.stock <= 0) {
        showToast("Produto fora de estoque");
        return;
    }

    const existing = cart.find(item => item.id === productId);
    const shouldAddItem = !existing || existing.quantity < product.stock;

    if (shouldAddItem) {
        const added = await addToCart(productId, { silentToast: true });
        if (!added) return;
    }

    const modal = document.getElementById("product-modal");
    if (modal?.classList.contains("open")) {
        closeProductModal();
    }

    const sidebar = document.getElementById("cart-sidebar");
    if (sidebar?.classList.contains("open")) {
        closeCart();
    }

    showToast("Produto pronto para finalizar");
    openCheckoutConfirmation();
}

function updateCartCount() {
    const cartCount = document.getElementById("cart-count");
    if (!cartCount) return;

    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = count;
}

function setupCartEvents() {
    const btn = document.getElementById("cart-btn");
    const overlay = document.getElementById("cart-overlay");
    const checkoutBtn = document.getElementById("checkout-btn");

    if (!btn || !overlay) return;

    btn.onclick = openCart;
    if (checkoutBtn) checkoutBtn.onclick = checkoutCart;

    overlay.addEventListener("click", closeCart);

    const sidebar = document.getElementById("cart-sidebar");

    if (sidebar) {
        sidebar.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }
}

async function checkoutCart() {
    openCheckoutConfirmation();
}

function buildCheckoutPayload() {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const lines = cart.map((item) => {
        const subtotal = item.price * item.quantity;
        return {
            name: item.name,
            quantity: item.quantity,
            unit: item.price,
            subtotal
        };
    });

    const message = [
        "Ola! Quero finalizar este pedido na Morango Makeup:",
        "",
        ...lines.map((item) => `- ${item.name} | qtd: ${item.quantity} | un: ${formatMoney(item.unit)} | subtotal: ${formatMoney(item.subtotal)}`),
        "",
        `Total: ${formatMoney(total)}`,
        "",
        "Observacao:"
    ].join("\n");

    return { total, totalItems, lines, message };
}

function renderCheckoutSummary(payload) {
    const container = document.getElementById("checkout-summary");
    const totalEl = document.getElementById("checkout-total");
    const itemsEl = document.getElementById("checkout-items");
    const noteEl = document.getElementById("checkout-note");

    if (!container || !totalEl || !itemsEl) return;

    totalEl.textContent = formatMoney(payload.total);
    itemsEl.textContent = `${payload.totalItems} ${payload.totalItems === 1 ? "item" : "itens"}`;

    container.innerHTML = payload.lines.map((item) => `
        <div class="checkout-line">
            <div>
                <strong>${item.name}</strong>
                <span>${item.quantity} x ${formatMoney(item.unit)}</span>
            </div>
            <strong>${formatMoney(item.subtotal)}</strong>
        </div>
    `).join("");

    if (noteEl) {
        noteEl.textContent = "Ao confirmar, abrimos o WhatsApp com o pedido pronto para envio.";
    }

    pendingCheckoutMessage = payload.message;
}

function openCheckoutConfirmation() {
    if (!cart.length) {
        showToast("Carrinho vazio");
        return;
    }

    const payload = buildCheckoutPayload();
    renderCheckoutSummary(payload);

    document.getElementById("checkout-overlay").style.display = "block";
    document.getElementById("checkout-modal").classList.add("open");
    document.body.classList.add("no-scroll");
}

function closeCheckoutConfirmation() {
    document.getElementById("checkout-overlay").style.display = "none";
    document.getElementById("checkout-modal").classList.remove("open");
    document.body.classList.remove("no-scroll");
}

async function confirmCheckout() {
    if (!cart.length) {
        closeCheckoutConfirmation();
        showToast("Carrinho vazio");
        return;
    }

    const whatsappWindow = window.open("", "_blank");
    if (!whatsappWindow) {
        showToast("Permita pop-ups para concluir o pedido");
        return;
    }

    try {
        for (const item of cart) {
            await updateProductStock(item.id, -item.quantity);
        }

        const message = pendingCheckoutMessage || buildCheckoutPayload().message;
        const whatsappUrl = `https://wa.me/5547988220959?text=${encodeURIComponent(message)}`;
        whatsappWindow.location.href = whatsappUrl;

        cart = [];
        saveCart();
        updateCartDisplay();
        updateCartCount();
        await loadProducts();
        closeCheckoutConfirmation();
        pendingCheckoutMessage = "";
        showToast("Pedido pronto no WhatsApp");
    } catch (err) {
        whatsappWindow.close();
        console.error(err);
        showToast(err.message || "Erro ao finalizar pedido");
    }
}

function openCart() {
    document.getElementById("cart-overlay").style.display = "block";
    document.getElementById("cart-sidebar").classList.add("open");
    updateCartDisplay();
}

function closeCart() {
    document.getElementById("cart-overlay").style.display = "none";
    document.getElementById("cart-sidebar").classList.remove("open");
}

function updateCartDisplay() {
    const container = document.getElementById("cart-items");
    const totalEl = document.getElementById("cart-total");
    const summaryEl = document.getElementById("cart-summary");

    if (!container || !totalEl) return;

    if (cart.length === 0) {
        container.innerHTML = `<p class="empty-state">Carrinho vazio</p>`;
        totalEl.textContent = "R$ 0,00";
        if (summaryEl) summaryEl.textContent = "0 itens";
        return;
    }

    container.innerHTML = "";
   let cartTotal = 0;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    cart.forEach((item) => {
        const price = item.price;
        const itemTotal = price * item.quantity;
        cartTotal += itemTotal;

        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
      <div class="cart-item-info">
        <img src="${item.image || 'img/julia_logo.png'}" alt="${item.name}" class="cart-item-image" onerror="this.onerror=null;this.src='img/julia_logo.png';">
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <span class="cart-item-price">R$ ${price.toFixed(2)}</span>
          <span class="cart-item-subtotal">Subtotal: R$ ${itemTotal.toFixed(2)}</span>
        </div>
      </div>
      <div class="quantity-controls">
        <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1
            })">-</button>
        <span>${item.quantity}</span>
        <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity + 1
            })">+</button>
        <button class="remove-btn" onclick="removeFromCart(${item.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
        container.appendChild(div);
    });

    totalEl.textContent = `R$ ${cartTotal.toFixed(2)}`;
    if (summaryEl) summaryEl.textContent = `${totalItems} ${totalItems === 1 ? "item" : "itens"}`;
}

function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
}

async function removeFromCart(productId) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    try {
        cart = cart.filter(i => i.id !== productId);
        saveCart();
        updateCartDisplay();
        updateCartCount();
        applyFilterAndRender();

    } catch (err) {
        console.error(err);
        showToast(err.message || "Erro ao remover item");
    }
}


async function updateQuantity(productId, newQty) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    if (newQty <= 0) {
        await removeFromCart(productId);
        return;
    }

    const diff = newQty - item.quantity;

    try {
        const product = products.find(p => p.id === productId);
        if (!product) {
            throw new Error("Produto nao encontrado");
        }

        if (diff > 0 && newQty > product.stock) {
            showToast("Estoque insuficiente");
            return;
        }

        item.quantity = newQty;
        saveCart();
        updateCartDisplay();
        updateCartCount();
        applyFilterAndRender();

    } catch (err) {
        console.error(err);
        showToast(err.message || "Erro ao atualizar quantidade");
    }
}

// Favoritos
function setupFavoritesEvents() {
    const btn = document.getElementById("favorites-btn");
    const overlay = document.getElementById("favorites-overlay");

    if (!btn || !overlay) return;

    btn.onclick = openFavorites;
    overlay.onclick = e => {
        if (e.target.id === "favorites-overlay") closeFavorites();
    };
}

function openFavorites() {
    document.getElementById("favorites-overlay").style.display = "block";
    document.getElementById("favorites-sidebar").classList.add("open");
    updateFavoritesDisplay();
}

function closeFavorites() {
    document.getElementById("favorites-overlay").style.display = "none";
    document.getElementById("favorites-sidebar").classList.remove("open");
}

function toggleFavorite(productId) {
    if (favorites.includes(productId)) {
        favorites = favorites.filter(id => id !== productId);
        showToast("Removido dos favoritos");
    } else {
        favorites.push(productId);
        showToast("Adicionado aos favoritos");
    }

    localStorage.setItem("favorites", JSON.stringify(favorites));

    updateFavoritesCount();
    updateFavoritesDisplay(); // atualiza sidebar
}

function updateFavIcon(productId) {
    const btn = document.getElementById(`fav-btn-${productId}`);
    if (!btn) return;

    const isActive = favorites.includes(productId);
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
}

// Toast
function showToast(message) { const toast = document.createElement("div"); 
    toast.className = "toast"; 
    toast.textContent = message; 
    document.body.appendChild(toast); 
    setTimeout(() => toast.remove(), 3000); }

function updateFavoritesCount() {
    const el = document.getElementById("favorites-count");
    if (!el) return;
    el.textContent = favorites.length;
}

function updateFavoritesDisplay() {
    const container = document.getElementById("favorites-items");

    if (favorites.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum favorito</p>';
        return;
    }

    container.innerHTML = "";
    const favoriteProducts = products.filter((p) => favorites.includes(p.id));

    favoriteProducts.forEach((product) => {
        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
            <div class="cart-item-info">
                <img src="${product.image || 'img/julia_logo.png'}" alt="${product.name}" class="cart-item-image" onerror="this.onerror=null;this.src='img/julia_logo.png';">
                <div class="cart-item-details">
                    <h4>${product.name}</h4>
                    <span class="cart-item-price">R$ ${product.price.toFixed(2)}</span>
                </div>
            </div>
            <button class="remove-btn">
                <i class="fas fa-heart text-xl"></i>
            </button>
        `;

        // 🔹 Evento para remover na hora
        div.querySelector(".remove-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(product.id);
        });

        container.appendChild(div);
    });
};

function saveFavorites() {
    localStorage.setItem("favorites", JSON.stringify(favorites));
}

// Renderiza paginação
function renderPagination() {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;

    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
    if (filteredProducts.length === 0) {
        pagination.innerHTML = "";
        return;
    }

    const createButton = (label, targetPage, className = "page-btn") => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.className = className;
        btn.disabled = targetPage === currentPage;
        btn.addEventListener("click", () => {
            currentPage = targetPage;
            renderProducts();
            renderPagination();
        });
        return btn;
    };

    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const visiblePages = [...pages]
        .filter(page => page >= 1 && page <= totalPages)
        .sort((a, b) => a - b);

    pagination.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "pagination-shell";

    const prev = createButton("Anterior", Math.max(1, currentPage - 1), "pagination-nav-btn");
    prev.disabled = currentPage === 1;

    const next = createButton("Próxima", Math.min(totalPages, currentPage + 1), "pagination-nav-btn");
    next.disabled = currentPage === totalPages;

    const pagesWrap = document.createElement("div");
    pagesWrap.className = "pagination-pages";

    let previousPage = 0;
    visiblePages.forEach((page) => {
        if (previousPage && page - previousPage > 1) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pagination-info";
            ellipsis.textContent = "…";
            pagesWrap.appendChild(ellipsis);
        }

        const btn = createButton(String(page), page);
        if (page === currentPage) {
            btn.classList.add("active");
        }
        pagesWrap.appendChild(btn);
        previousPage = page;
    });

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = `Página ${currentPage} de ${totalPages}`;

    shell.appendChild(prev);
    shell.appendChild(pagesWrap);
    shell.appendChild(next);
    shell.appendChild(info);

    pagination.appendChild(shell);
}

// modal
function openProductModal(id) {
    const p = products.find(p => p.id === id);
    if (!p) return;

    const price = p.price;
    const old = hasValidOldPrice(p) ? p.oldPrice : null;
    const hasOldPrice = old !== null;

    // Lógica para o botão fora de estoque dentro do modal
    let modalActionButtonHTML = '';
    if (p.stock > 0) {
        modalActionButtonHTML = `
            <button class="modal-add-btn" onclick="addToCart(${p.id});closeProductModal();">
                <i class="fas fa-cart-plus"></i>Adicionar ao Carrinho
            </button>
            <button class="modal-buy-btn" onclick="buyNow(${p.id})">
                <i class="fa-brands fa-whatsapp"></i>Comprar agora
            </button>
        `;
    } else {
        modalActionButtonHTML = `
            <button class="out-of-stock-btn modal-stock-btn" disabled>
                Fora de Estoque
            </button>
        `;
    };

    const modalContent = document.getElementById('product-modal-content');
    modalContent.innerHTML = `
        <div class="modal-product-layout" itemscope itemtype="https://schema.org/Product">
            <div class="modal-img">
                <img src="${getProductImage(p)}" alt="${p.name}" onerror="this.onerror=null;this.src='img/julia_logo.png';">
            </div>
            <div class="modal-flex">
                <h2>${p.name}</h2>
                <meta itemprop="name" content="${p.name}">
                <meta itemprop="description" content="${p.description}">
                <meta itemprop="price" content="${p.price}">

                <div class="modal-price">
                    ${hasOldPrice ? `<span class="modal-old-price">R$ ${old.toFixed(2)}</span>` : ''}
                    <span class="modal-current-price">R$ ${price.toFixed(2)}</span>
                </div>
                <div class="modal-description">
                    <h4>Descrição</h4>
                    <p>${p.description}</p>
                </div>
                <div class="modal-actions ${p.stock > 0 ? 'modal-actions-ready' : 'modal-actions-disabled'}">
                    <div class="modal-primary-actions">
                        ${modalActionButtonHTML}
                    </div>
                    <div class="modal-secondary-actions">
                    <button type="button" class="modal-fav-btn ${favorites.includes(p.id) ? 'active' : ''}" id="fav-btn-${p.id}" aria-pressed="${favorites.includes(p.id) ? 'true' : 'false'}" onclick="toggleFavorite(${p.id});updateFavIcon(${p.id});">
                        <i class="fas fa-heart"></i>
                    </button>
                    <button type="button" class="modal-share-btn" onclick="shareProduct(${p.id})">
                        <i class="fas fa-share-nodes"></i>
                    </button>
                        <a class="modal-product-link" href="product.html?id=${p.id}">
                        <i class="fas fa-up-right-from-square"></i>
                        Página do produto
                    </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('product-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
    document.body.classList.add("no-scroll");
};

function closeProductModal() {
    document.getElementById('product-modal').classList.remove('open');
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
};

async function shareProduct(productId) {
    const product = products.find(item => item.id === productId);
    if (!product) return;

    const pageUrl = new URL(`product.html?id=${product.id}`, window.location.href).href;
    const shareText = `${product.name} - R$ ${product.price.toFixed(2)} | Morango Makeup`;
    const payload = {
        title: product.name,
        text: shareText,
        url: pageUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(payload);
            showToast("Produto compartilhado");
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(`${shareText}\n${pageUrl}`);
            showToast("Link copiado");
            return;
        }

        const tempInput = document.createElement("input");
        tempInput.value = `${shareText}\n${pageUrl}`;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        tempInput.remove();
        showToast("Link copiado");
    } catch (err) {
        console.error(err);
        showToast("Nao foi possivel compartilhar");
    }
}

