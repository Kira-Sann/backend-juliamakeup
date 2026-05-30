
/*************************
 * DADOS E ESTADO
 *************************/
let products = [];
let filteredProducts = [];
let currentTab = "all";
let currentPage = 1;
let searchTerm = "";
const itemsPerPage = 10;
const API_URL = "https://backend-juliamakeup.onrender.com";

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let favorites = (JSON.parse(localStorage.getItem("favorites")) || []).map(Number);

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

/*************************
 * API
 *************************/
async function loadProducts() {
    try {
        const res = await fetch(`${API_URL}/products?nocache=${Date.now()}`);
;
        const data = await res.json();

        // 🔑 NORMALIZA TUDO AQUI
        products = data.map(p => ({
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
            ...p,
            isSale: p.isSale || hasValidOldPrice(p)
        }));

        applyFilterAndRender();
        updateFavoritesCount();
        updateCartCount();

    } catch (err) {
        console.error("Erro ao carregar produtos", err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadProducts();
    setupSearch();

    setupFilters();
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

function applyFilterAndRender() {
    let temp = [...products];

    if (currentTab === "featured") temp = temp.filter(p => p.featured);
    else if (currentTab === "new") temp = temp.filter(p => p.isNew);
    else if (currentTab === "promo") temp = temp.filter(p => p.isSale);
    else if (currentTab !== "all") temp = temp.filter(p => p.category === currentTab);

    if (searchTerm.length >= 2) {
        temp = temp.filter(p => matchesSearch(p, searchTerm));
    }

    filteredProducts = temp.sort((a, b) => Number(b.featured) - Number(a.featured));
    renderProducts();
    renderPagination();
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
}

function renderProducts() {
    const container = document.getElementById("products-container");
    if (!container) return;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredProducts.slice(start, end);

    if (!pageItems.length) {
        container.innerHTML = `<p class="empty-state">Nenhum produto encontrado 😢</p>`;
        return;
    }

    container.innerHTML = pageItems.map(p => `
        <div class="product-card">
            <div class="product-image-container">
                <img 
                    src="${p.image}" 
                    alt="${p.name}" 
                    class="product-image"
                    onclick="openProductModal(${p.id})"
                />
                <div class="product-badges">
                    ${p.featured ? `<span class="badge badge-featured">Destaque</span>` : ""}
                    ${p.isNew ? `<span class="badge badge-new">Novo</span>` : ""}
                    ${p.isSale ? `<span class="badge badge-sale">Promoção</span>` : ""}
                </div>
               <button class="heart-btn" data-id="${p.id}">
                    <i class="fa-solid fa-heart ${favorites.includes(p.id) ? "active" : ""}"></i>
                </button>
            </div>

            <div class="product-info">
                <h3>${p.name}</h3>
                <p>${p.shortDescription || ""}</p>

                <div class="price-container">
                    ${hasValidOldPrice(p) ? `<span class="original-price">R$ ${p.oldPrice.toFixed(2)}</span>` : ""}
                    <span class="current-price">R$ ${p.price.toFixed(2)}</span>
                </div>
                ${p.stock > 0 && p.stock <= 3 ? `<span class="low-stock-label">Ultimas unidades</span>` : ""}

                ${p.stock > 0
            ? `<button class="add-to-cart-btn" onclick="addToCart(${p.id})">Adicionar</button>`
            : `<button class="out-of-stock-btn" disabled>Fora de estoque</button>`
        }
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
    const res = await fetch(`${API_URL}/products/${productId}/stock`, {
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

async function addToCart(productId) {
    const product = products.find(p => p.id === productId);

    if (!product || product.stock <= 0) {
        showToast("Produto fora de estoque");
        return;
    }

    try {
        const existing = cart.find(item => item.id === productId);

        if (existing) {
            if (existing.quantity >= product.stock) {
                showToast("Estoque insuficiente");
                return;
            }
            existing.quantity += 1;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity: 1
            });
        }

        saveCart();
        updateCartCount();
        showToast("Produto adicionado ao carrinho");
        updateCartDisplay();
        applyFilterAndRender();
    } catch (err) {
        console.error(err);
        showToast(err.message || "Erro ao adicionar produto");
    }
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById("cart-count").textContent = count;
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
    if (!cart.length) {
        showToast("Carrinho vazio");
        return;
    }

    try {
        for (const item of cart) {
            await updateProductStock(item.id, -item.quantity);
        }

        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const lines = cart.map((item) => {
            const subtotal = item.price * item.quantity;
            return `- ${item.name} | qtd: ${item.quantity} | un: R$ ${item.price.toFixed(2)} | subtotal: R$ ${subtotal.toFixed(2)}`;
        });

        const message = [
            "Ola! Quero finalizar este pedido na Morango Makeup:",
            "",
            ...lines,
            "",
            `Total: R$ ${total.toFixed(2)}`,
            "",
            "Observacao:"
        ].join("\n");

        window.open(`https://wa.me/5547988220959?text=${encodeURIComponent(message)}`, "_blank");
        cart = [];
        saveCart();
        updateCartDisplay();
        updateCartCount();
        await loadProducts();
    } catch (err) {
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

    if (!container || !totalEl) return;

    if (cart.length === 0) {
        container.innerHTML = `<p class="empty-state">Carrinho vazio</p>`;
        totalEl.textContent = "R$ 0,00";
        return;
    }

    container.innerHTML = "";
   let cartTotal = 0;

    cart.forEach((item) => {
        const price = item.price;
        const itemTotal = price * item.quantity;
        cartTotal += itemTotal;

        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
      <div class="cart-item-info">
        <img src="${item.image}" alt="${item.name}" class="cart-item-image">
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <span class="cart-item-price">R$ ${price.toFixed(2)}</span>
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
                <img src="${product.image}" alt="${product.name}" class="cart-item-image">
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
    pagination.innerHTML = "";

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.className = `page-btn ${i === currentPage ? "active" : ""}`;
        btn.addEventListener("click", () => {
            currentPage = i;
            renderProducts();
            renderPagination();
        });
        pagination.appendChild(btn);
    }
}

// modal
function openProductModal(id) {
    const p = products.find(p => p.id === id);
    if (!p) return;

    const price = p.price;
    const old = hasValidOldPrice(p) ? p.oldPrice : null;

    // Lógica para o botão fora de estoque dentro do modal
    let modalActionButtonHTML = '';
    if (p.stock > 0) {
        modalActionButtonHTML = `
            <button class="add-btn" style="flex:1; color:#ffff;background:#a478ef;cursor:pointer;border-radius:0.5rem;border:none;" onclick="addToCart(${p.id});closeProductModal();">
                <i class="fas fa-cart-plus mr-2" style="padding:10px;"></i>Adicionar ao Carrinho
            </button>
        `;
    } else {
        modalActionButtonHTML = `
            <button class="out-of-stock-btn" disabled style="flex:1; background:#ccc; color:#666; cursor:not-allowed; border-radius:0.5rem; border:none; padding:10px;">
                Fora de Estoque
            </button>
        `;
    };

    const modalContent = document.getElementById('product-modal-content');
    modalContent.innerHTML = `
        <div class="grid" itemscope itemtype="https://schema.org/Product">
            <div class="modal-img">
                <img src="${p.image}" alt="${p.name}">
            </div>
            <div class="modal-flex">
                <h2>${p.name}</h2>
                <meta itemprop="name" content="${p.name}">
                <meta itemprop="description" content="${p.description}">
                <meta itemprop="price" content="${p.price}">

                <div class="modal-price">
                    ${old ? `<span class="old-price">R$ ${old.toFixed(2)}</span>` : ''}
                    <span class="price">R$ ${price.toFixed(2)}</span>
                </div>
                <div style="margin-bottom:1.5rem">
                    <h4 style="font-weight:600;margin-bottom:.5rem">Descrição</h4>
                    <p style="color:#6b7280;line-height:1.6">${p.description}</p>
                </div>
                <div style="display:flex;gap:1rem">
                    ${modalActionButtonHTML}
                    <button type="button" id="fav-btn-${p.id}" style="padding:.75rem 1.5rem;border:1px solid #d1d5db;border-radius:.5rem;cursor:pointer" onclick="toggleFavorite(${p.id});updateFavIcon(${p.id});">
                        <i class="fas fa-heart ${favorites.includes(p.id) ? 'text-red-500' : 'text-gray-600'}"></i>
                    </button>
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

