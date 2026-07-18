/*************************
 * DADOS E ESTADO
 *************************/
let products = [];
let editingId = null;
let currentImages = [];
let selectedImageFiles = [];
const LOCAL_API_URL = "http://localhost:3001";
const REMOTE_API_URL = "https://backend-juliamakeup.onrender.com";
const LOCAL_FRONTEND_HOSTS = ["localhost", "127.0.0.1", ""];
let API_URL = LOCAL_FRONTEND_HOSTS.includes(window.location.hostname) || window.location.protocol === "file:"
  ? LOCAL_API_URL
  : REMOTE_API_URL;
const ADMIN_STORAGE_PREFIX = "adminToken";
const THEME_STORAGE_KEY = "theme";

const isNew = document.getElementById("isNew");
const isSale = document.getElementById("isSale");

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
      icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
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

function getAdminStorageKey(apiUrl = API_URL) {
  try {
    return `${ADMIN_STORAGE_PREFIX}:${new URL(apiUrl).host}`;
  } catch (err) {
    return ADMIN_STORAGE_PREFIX;
  }
}

function refreshAuthHeaderForActiveApi(options = {}) {
  if (!options.headers) return options;

  const headers = new Headers(options.headers);
  if (headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${getAdminToken()}`);
  }

  return {
    ...options,
    headers
  };
}

async function adminFetch(path, options = {}) {
  try {
    return await fetch(`${API_URL}${path}`, options);
  } catch (error) {
    if (API_URL !== LOCAL_API_URL) throw error;

    API_URL = REMOTE_API_URL;
    return fetch(`${API_URL}${path}`, refreshAuthHeaderForActiveApi(options));
  }
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

function getPrimaryImage(product) {
  return mergeImageLists(product.images, product.image)[0] || product.image || "img/julia_logo.png";
}

function renderImagePreview(images = []) {
  if (!imagePreview) return;

  const list = normalizeImageList(images);

  if (!list.length) {
    imagePreview.innerHTML = "<p class='preview-empty'>Nenhuma imagem selecionada</p>";
    return;
  }

  imagePreview.innerHTML = list.map((image) => `
    <img src="${image}" alt="Prévia do produto" onerror="this.onerror=null;this.src='img/julia_logo.png';">
  `).join("");
}

function clearSelectedImageFiles() {
  selectedImageFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  selectedImageFiles = [];
}

function renderEditableImagePreview(images) {
  if (!imagePreview) return;

  if (Array.isArray(images)) {
    currentImages = normalizeImageList(images);
  }

  if (!currentImages.length && !selectedImageFiles.length) {
    imagePreview.innerHTML = "<p class='preview-empty'>Nenhuma imagem selecionada</p>";
    return;
  }

  const existingTiles = currentImages.map((image, index) => `
    <div class="preview-tile">
      <img src="${image}" alt="Previa do produto" onerror="this.onerror=null;this.src='img/julia_logo.png';">
      <button type="button" class="preview-remove" data-remove-image="existing" data-index="${index}" aria-label="Remover imagem">&times;</button>
    </div>
  `).join("");

  const selectedTiles = selectedImageFiles.map((item, index) => `
    <div class="preview-tile">
      <img src="${item.previewUrl}" alt="Nova imagem do produto">
      <button type="button" class="preview-remove" data-remove-image="selected" data-index="${index}" aria-label="Remover imagem">&times;</button>
    </div>
  `).join("");

  imagePreview.innerHTML = existingTiles + selectedTiles;
}

function readAdminHistory() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_HISTORY_KEY) || "[]");
  } catch (err) {
    return [];
  }
}

function saveAdminHistory(entries) {
  localStorage.setItem(ADMIN_HISTORY_KEY, JSON.stringify(entries.slice(0, 30)));
}

function formatAdminTime(value) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function describeProductDiff(previous, next) {
  const changes = [];

  if (!previous || !next) return "";

  if (previous.price !== next.price) changes.push(`preço ${Number(previous.price).toFixed(2)} -> ${Number(next.price).toFixed(2)}`);
  if ((previous.oldPrice || null) !== (next.oldPrice || null)) changes.push(`preço antigo ${previous.oldPrice ? Number(previous.oldPrice).toFixed(2) : "vazio"} -> ${next.oldPrice ? Number(next.oldPrice).toFixed(2) : "vazio"}`);
  if (Number(previous.stock) !== Number(next.stock)) changes.push(`estoque ${Number(previous.stock)} -> ${Number(next.stock)}`);
  if ((previous.category || "") !== (next.category || "")) changes.push(`categoria ${previous.category || "vazia"} -> ${next.category || "vazia"}`);
  if (Boolean(previous.featured) !== Boolean(next.featured)) changes.push(`destaque ${next.featured ? "ativado" : "desativado"}`);
  if (Boolean(previous.isNew) !== Boolean(next.isNew)) changes.push(`novo ${next.isNew ? "ativado" : "desativado"}`);
  if (Boolean(previous.isSale) !== Boolean(next.isSale)) changes.push(`promoção ${next.isSale ? "ativada" : "desativada"}`);

  return changes.join(" • ");
}

function addAdminHistory(action, productName, details = "") {
  const history = readAdminHistory();
  history.unshift({
    id: Date.now() + Math.random(),
    action,
    productName,
    details,
    createdAt: new Date().toISOString()
  });
  saveAdminHistory(history);
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;

  const history = readAdminHistory();

  if (!history.length) {
    historyList.innerHTML = "<p class='history-empty'>Nenhuma ação registrada ainda.</p>";
    return;
  }

  historyList.innerHTML = history.map((entry) => `
    <article class="history-item">
      <div class="history-item-top">
        <strong>${entry.action}</strong>
        <span>${formatAdminTime(entry.createdAt)}</span>
      </div>
      <p>${entry.productName || "Produto"}${entry.details ? ` • ${entry.details}` : ""}</p>
    </article>
  `).join("");
}

/*************************
 * API
 *************************/
async function loadProducts() {
  const res = await adminFetch("/products");
  const data = await res.json();

  products = data.map((product) => ({
    ...product,
    price: Number(product.price) || 0,
    oldPrice: toOptionalNumber(product.oldPrice),
    stock: Number(product.stock) || 0,
    isNew: toBoolean(product.isNew),
    isSale: toBoolean(product.isSale),
    featured: toBoolean(product.featured),
    images: mergeImageLists(product.images, product.image),
    imagePublicIds: mergeImageLists(product.imagePublicIds, product.imagePublicId)
  }));

  renderList(products);
}

/*************************
 * ELEMENTOS DO DOM
 *************************/
const form = document.getElementById("product-form");
const list = document.getElementById("product-list");

const nameInput = document.getElementById("name");
const priceInput = document.getElementById("price");
const oldPriceInput = document.getElementById("oldPrice");
const imageInput = document.getElementById("image");
const shortDescInput = document.getElementById("shortDescription");
const descInput = document.getElementById("description");
const stockInput = document.getElementById("stock");
const categoryInput = document.getElementById("category");
const imagePreview = document.getElementById("image-preview");
const adminSearch = document.getElementById("admin-search");
const passwordForm = document.getElementById("password-form");
const passwordPanel = document.getElementById("password-panel");
const togglePasswordPanelButton = document.getElementById("toggle-password-panel");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const toggleHistoryPanelButton = document.getElementById("toggle-history-panel");
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput = document.getElementById("new-password");
const passwordMessage = document.getElementById("password-message");
const featuredInput = document.getElementById("featured");
const productSubmitButton = document.getElementById("product-submit-btn");
const ADMIN_HISTORY_KEY = "adminHistory";

if (imageInput) {
  imageInput.addEventListener("change", () => {
    const file = Array.from(imageInput.files || [])[0];

    if (!file) return;

    selectedImageFiles.push({
      file,
      previewUrl: URL.createObjectURL(file)
    });
    imageInput.value = "";
    renderEditableImagePreview();
  });
}

if (imagePreview) {
  imagePreview.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-image]");
    if (!button) return;

    const index = Number(button.dataset.index);

    if (button.dataset.removeImage === "existing") {
      currentImages.splice(index, 1);
    }

    if (button.dataset.removeImage === "selected") {
      const [removed] = selectedImageFiles.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
    }

    renderEditableImagePreview();
  });
}

/*************************
 * AUTENTICAÇÃO
 *************************/


function getAdminToken() {
  return localStorage.getItem(getAdminStorageKey()) || "";
}

function isAdminAuthenticated() {
  return Boolean(getAdminToken());
}

async function loginAdmin() {
  const input = document.getElementById("admin-password");
  const error = document.getElementById("login-error");

  error.textContent = "";

  try {
    const res = await adminFetch("/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: input.value })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.token) {
      error.textContent = data.error || "Nao foi possivel entrar";
      return;
    }

    localStorage.setItem(getAdminStorageKey(), data.token);
    input.value = "";
    showAdmin();
  } catch (err) {
    console.error(err);
    error.textContent = "Erro ao conectar com o servidor";
  }
}

function logoutAdmin() {
  localStorage.removeItem(getAdminStorageKey());
  location.reload();
}

function showAdmin() {
  document.getElementById("admin-login").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
  renderList();
  renderHistory();
}

function getAdminHeaders() {
  return {
    Authorization: `Bearer ${getAdminToken()}`
  };
}

async function readResponseBody(res) {
  const text = await res.text().catch(() => "");

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (err) {
    if (/<!doctype|<html|<pre>/i.test(text)) {
      const cleanText = text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        message: cleanText || "Erro interno no servidor"
      };
    }

    return { message: text };
  }
}

function getApiErrorMessage(data, fallback) {
  return data?.error || data?.message || data?.details || fallback;
}

function handleAdminRequestError(res, data, fallback) {
  if (res.status === 401 || res.status === 403) {
    alert(getApiErrorMessage(data, "Sessao expirada. Entre novamente no admin."));
    logoutAdmin();
    return true;
  }

  alert(`${getApiErrorMessage(data, fallback)} (status ${res.status})`);
  return true;
}

async function checkAdminAuth() {
  const token = getAdminToken();

  if (!token) return;

  try {
    const res = await adminFetch("/admin/session", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.ok) {
      showAdmin();
      return;
    }
  } catch (err) {
    console.error(err);
  }

  localStorage.removeItem(getAdminStorageKey());
}

document.addEventListener("DOMContentLoaded", async () => {
  setupThemeToggle();
  await checkAdminAuth();
  loadProducts();
  renderHistory();
});

if (togglePasswordPanelButton) {
  togglePasswordPanelButton.addEventListener("click", () => {
    setPasswordPanelVisibility(Boolean(passwordPanel?.hidden));
  });
}

if (toggleHistoryPanelButton) {
  toggleHistoryPanelButton.addEventListener("click", () => {
    setHistoryPanelVisibility(Boolean(historyPanel?.hidden));
  });
}

function setPasswordMessage(message, type = "") {
  if (!passwordMessage) return;

  passwordMessage.textContent = message;
  passwordMessage.className = "status-message";

  if (type) {
    passwordMessage.classList.add(type);
  }
}

function setPasswordPanelVisibility(visible) {
  if (!passwordPanel || !togglePasswordPanelButton) return;

  passwordPanel.hidden = !visible;
  togglePasswordPanelButton.classList.toggle("active", visible);
  togglePasswordPanelButton.innerHTML = visible
    ? '<i class="fa-solid fa-xmark"></i> Fechar senha'
    : '<i class="fa-solid fa-key"></i> Senha';

  if (!visible) {
    passwordForm?.reset();
    setPasswordMessage("");
  }
}

function setHistoryPanelVisibility(visible) {
  if (!historyPanel || !toggleHistoryPanelButton) return;

  historyPanel.hidden = !visible;
  toggleHistoryPanelButton.classList.toggle("active", visible);
  toggleHistoryPanelButton.innerHTML = visible
    ? '<i class="fa-solid fa-xmark"></i> Fechar hist&oacute;rico'
    : '<i class="fa-solid fa-clock-rotate-left"></i> Hist&oacute;rico';

  if (visible) {
    renderHistory();
  }
}

/*************************
 * RENDERIZA LISTA
 *************************/
function renderList(listToRender = products) {
  list.innerHTML = "";

  if (listToRender.length === 0) {
    list.innerHTML = "<p class='status-message'>Nenhum produto encontrado</p>";
    return;
  }

  listToRender.forEach(p => {
    const div = document.createElement("div");
    div.className = "admin-product";
    const stock = Number(p.stock) || 0;
    const oldPrice = hasValidOldPrice(p) ? Number(p.oldPrice) : null;
    const images = mergeImageLists(p.images, p.image);

    div.innerHTML = `
      <img class="admin-product-thumb" src="${getPrimaryImage(p)}" alt="${p.name}" onerror="this.onerror=null;this.src='img/julia_logo.png';">
      <div class="product-copy">
        <strong>${p.name}</strong>
      </div>

      <div class="product-meta">
        <span class="${stock > 0 && stock <= 3 ? "stock-low" : ""}">Estoque: ${stock}</span>
        ${stock > 0 && stock <= 3 ? "<span class='stock-low'>Estoque baixo</span>" : ""}
        <span>R$ ${Number(p.price).toFixed(2)}</span>
        ${oldPrice ? `<span>De R$ ${oldPrice.toFixed(2)}</span>` : ""}
        ${p.category ? `<span>${p.category}</span>` : ""}
        ${p.isNew ? "<span>Novo</span>" : ""}
        ${hasValidOldPrice(p) ? "<span>Promocao</span>" : ""}
        ${isFeaturedProduct(p) ? "<span>Destaque</span>" : ""}
        ${images.length > 1 ? `<span>${images.length} imagens</span>` : ""}
      </div>

      <div class="actions">
        <button class="action-btn edit-btn" onclick="editProduct(${p.id})"><i class="fa-solid fa-pen"></i> Editar</button>
        <button class="action-btn duplicate-btn" onclick="duplicateProduct(${p.id})"><i class="fa-solid fa-copy"></i> Duplicar</button>
        <button class="action-btn remove-btn" onclick="removeProduct(${p.id})"><i class="fa-solid fa-trash"></i> Remover</button>
      </div>
    `;

    list.appendChild(div);
  });
}

/*************************
 * SALVAR / REMOVER
 *************************/
async function removeProduct(id) {
  const product = products.find((item) => item.id === id);
  const res = await adminFetch(`/products/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders()
  });

  if (!res.ok) {
    const data = await readResponseBody(res);
    handleAdminRequestError(res, data, "Nao foi possivel remover o produto.");
    return;
  }

  if (product) {
    addAdminHistory("Removido", product.name, `Estoque ${Number(product.stock) || 0}`);
  }

  await loadProducts();
}

/*************************
 * EDITAR PRODUTO
 *************************/
function editProduct(id) {
  const p = products.find(prod => prod.id === id);
  if (!p) return;

  editingId = id;
  currentImages = mergeImageLists(p.images, p.image);

  nameInput.value = p.name;
  priceInput.value = p.price;
  oldPriceInput.value = p.oldPrice ?? "";
  shortDescInput.value = p.shortDescription || "";
  descInput.value = p.description || "";
  stockInput.value = p.stock ?? 0;
  categoryInput.value = p.category || "";
  isNew.checked = p.isNew;
  isSale.checked = p.isSale;
  featuredInput.checked = isFeaturedProduct(p);
  imageInput.value = "";

  clearSelectedImageFiles();
  renderEditableImagePreview(currentImages);

  if (productSubmitButton) productSubmitButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Atualizar Produto';
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicateProduct(id) {
  const p = products.find(prod => prod.id === id);
  if (!p) return;

  editingId = null;
  currentImages = mergeImageLists(p.images, p.image);
  nameInput.value = `${p.name} (copia)`;
  priceInput.value = p.price;
  oldPriceInput.value = p.oldPrice ?? "";
  shortDescInput.value = p.shortDescription || "";
  descInput.value = p.description || "";
  stockInput.value = p.stock ?? 0;
  categoryInput.value = p.category || "";
  isNew.checked = Boolean(p.isNew);
  isSale.checked = Boolean(p.isSale);
  featuredInput.checked = isFeaturedProduct(p);
  imageInput.value = "";

  clearSelectedImageFiles();
  renderEditableImagePreview(currentImages);

  if (productSubmitButton) productSubmitButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Produto';
  window.scrollTo({ top: 0, behavior: "smooth" });
  addAdminHistory("Duplicado", p.name, "Aberto no formulário para nova cópia");
}

function validateProductForm() {
  const name = nameInput.value.trim();
  const price = Number(priceInput.value);
  const stock = Number(stockInput.value);
  const oldPrice = toOptionalNumber(oldPriceInput.value);

  if (!name) {
    alert("Informe o nome do produto.");
    return false;
  }

  if (!Number.isFinite(price) || price <= 0) {
    alert("Informe um preço valido maior que zero.");
    return false;
  }

  if (!Number.isFinite(stock) || stock < 0) {
    alert("Informe um estoque valido.");
    return false;
  }

  if (oldPrice !== null && oldPrice <= price) {
    alert("O preço antigo precisa ser maior que o preço atual.");
    return false;
  }

  return true;
}

/*************************
 * SUBMIT DO FORM
 *************************/
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!isAdminAuthenticated()) {
    alert("Acesso negado");
    return;
  }

  if (!validateProductForm()) {
    return;
  }

  const previousProduct = editingId ? products.find((item) => item.id === editingId) : null;
  const formData = new FormData();

  formData.append("name", nameInput.value.trim());
  formData.append("price", priceInput.value);
  formData.append("oldPrice", oldPriceInput.value);
  formData.append("shortDescription", shortDescInput.value);
  formData.append("description", descInput.value);
  formData.append("stock", stockInput.value);
  formData.append("category", categoryInput.value);
  formData.append("isNew", isNew.checked);
  formData.append("isSale", isSale.checked);
  formData.append("featured", featuredInput.checked);

  formData.append("existingImages", JSON.stringify(currentImages));

  selectedImageFiles.forEach((item) => {
    formData.append("images", item.file);
  });

  if (editingId) {
    const res = await adminFetch(`/products/${editingId}`, {
      method: "PUT",
      headers: getAdminHeaders(),
      body: formData
    });

    if (!res.ok) {
      const data = await readResponseBody(res);
      handleAdminRequestError(res, data, "Nao foi possivel atualizar o produto.");
      return;
    }

    editingId = null;
    const updatedSnapshot = {
      name: nameInput.value.trim(),
      price: Number(priceInput.value),
      oldPrice: toOptionalNumber(oldPriceInput.value),
      stock: Number(stockInput.value),
      category: categoryInput.value,
      isNew: isNew.checked,
      isSale: isSale.checked,
      featured: featuredInput.checked
    };
    addAdminHistory("Atualizado", updatedSnapshot.name, describeProductDiff(previousProduct, updatedSnapshot));
  } else {
    const res = await adminFetch("/products", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    });

    if (!res.ok) {
      const data = await readResponseBody(res);
      handleAdminRequestError(res, data, "Nao foi possivel criar o produto.");
      return;
    }

    addAdminHistory("Criado", nameInput.value.trim(), `Preço ${Number(priceInput.value).toFixed(2)} | Estoque ${stockInput.value}`);
  }

  await loadProducts();

  form.reset();
  imageInput.value = "";
  currentImages = [];
  clearSelectedImageFiles();
  renderEditableImagePreview([]);
  if (productSubmitButton) productSubmitButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Produto';
});

if (passwordForm) {
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isAdminAuthenticated()) {
      alert("Acesso negado");
      return;
    }

    setPasswordMessage("");

    const res = await adminFetch("/admin/change-password", {
      method: "POST",
      headers: {
        ...getAdminHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value
      })
    });

    const data = await readResponseBody(res);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (data.error === "Senha atual incorreta") {
          setPasswordMessage(data.error, "error");
          return;
        }

        logoutAdmin();
        return;
      }

      setPasswordMessage(getApiErrorMessage(data, "Nao foi possivel atualizar a senha"), "error");
      return;
    }

    passwordForm.reset();
    setPasswordMessage("Senha atualizada com sucesso", "success");
    setTimeout(() => setPasswordPanelVisibility(false), 1200);
  });
}


/*************************
 * BUSCA NO ADMIN
 *************************/
if (adminSearch) {
  adminSearch.addEventListener("input", () => {
    const term = adminSearch.value.trim();
    const filtered = products.filter(p => matchesSearch(p, term));
    renderList(filtered);
  });
}

function normalizeText(text = "") {
  return text
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
  const desc = normalizeText(product.description || "");

  return words.every(word =>
    name.includes(word) ||
    shortDesc.includes(word) ||
    desc.includes(word)
  );
}
