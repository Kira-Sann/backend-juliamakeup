/*************************
 * DADOS E ESTADO
 *************************/
let products = [];
let editingId = null;
let currentImage = "";
const API_URL = "https://backend-juliamakeup.onrender.com";
const ADMIN_STORAGE_KEY = "adminToken";

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

/*************************
 * API
 *************************/
async function loadProducts() {
  const res = await fetch(`${API_URL}/products`);
  const data = await res.json();

  products = data.map((product) => ({
    ...product,
    price: Number(product.price) || 0,
    oldPrice: toOptionalNumber(product.oldPrice),
    stock: Number(product.stock) || 0,
    isNew: toBoolean(product.isNew),
    isSale: toBoolean(product.isSale),
    featured: toBoolean(product.featured)
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
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput = document.getElementById("new-password");
const passwordMessage = document.getElementById("password-message");
const featuredInput = document.getElementById("featured");

/*************************
 * AUTENTICAÇÃO
 *************************/


function getAdminToken() {
  return localStorage.getItem(ADMIN_STORAGE_KEY) || "";
}

function isAdminAuthenticated() {
  return Boolean(getAdminToken());
}

async function loginAdmin() {
  const input = document.getElementById("admin-password");
  const error = document.getElementById("login-error");

  error.textContent = "";

  try {
    const res = await fetch(`${API_URL}/admin/login`, {
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

    localStorage.setItem(ADMIN_STORAGE_KEY, data.token);
    input.value = "";
    showAdmin();
  } catch (err) {
    console.error(err);
    error.textContent = "Erro ao conectar com o servidor";
  }
}

function logoutAdmin() {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  location.reload();
}

function showAdmin() {
  document.getElementById("admin-login").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
  renderList();
}

function getAdminHeaders() {
  return {
    Authorization: `Bearer ${getAdminToken()}`
  };
}

async function checkAdminAuth() {
  const token = getAdminToken();

  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/admin/session`, {
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

  localStorage.removeItem(ADMIN_STORAGE_KEY);
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkAdminAuth();
  loadProducts();
});

if (togglePasswordPanelButton) {
  togglePasswordPanelButton.addEventListener("click", () => {
    setPasswordPanelVisibility(Boolean(passwordPanel?.hidden));
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
  togglePasswordPanelButton.textContent = visible ? "Fechar senha" : "Senha";

  if (!visible) {
    passwordForm?.reset();
    setPasswordMessage("");
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
    const oldPrice = p.oldPrice ? Number(p.oldPrice) : null;

    div.innerHTML = `
      <img class="admin-product-thumb" src="${p.image || "/img/julia_logo.png"}" alt="${p.name}">
      <div class="product-copy">
        <strong>${p.name}</strong>
        <p>${p.shortDescription || "Sem descricao curta"}</p>
      </div>

      <div class="product-meta">
        <span class="${stock > 0 && stock <= 3 ? "stock-low" : ""}">Estoque: ${stock}</span>
        ${stock > 0 && stock <= 3 ? "<span class='stock-low'>Estoque baixo</span>" : ""}
        <span>R$ ${Number(p.price).toFixed(2)}</span>
        ${oldPrice ? `<span>De R$ ${oldPrice.toFixed(2)}</span>` : ""}
        ${p.category ? `<span>${p.category}</span>` : ""}
        ${p.isNew ? "<span>Novo</span>" : ""}
        ${p.isSale ? "<span>Promocao</span>" : ""}
        ${p.featured ? "<span>Destaque</span>" : ""}
      </div>

      <div class="actions">
        <button onclick="editProduct(${p.id})">Editar</button>
        <button onclick="duplicateProduct(${p.id})">Duplicar</button>
        <button onclick="removeProduct(${p.id})">Remover</button>
      </div>
    `;

    list.appendChild(div);
  });
}

/*************************
 * SALVAR / REMOVER
 *************************/
async function removeProduct(id) {
  const res = await fetch(`${API_URL}/products/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders()
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      logoutAdmin();
      return;
    }
    alert(data.error || "Nao foi possivel remover o produto.");
    return;
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
  currentImage = p.image || "";

  nameInput.value = p.name;
  priceInput.value = p.price;
  oldPriceInput.value = p.oldPrice ?? "";
  shortDescInput.value = p.shortDescription || "";
  descInput.value = p.description || "";
  stockInput.value = p.stock ?? 0;
  categoryInput.value = p.category || "";
  isNew.checked = p.isNew;
  isSale.checked = p.isSale;
  featuredInput.checked = Boolean(p.featured);

  if (currentImage) {
    imagePreview.src = currentImage;
    imagePreview.style.display = "block";
  }

  form.querySelector("button").textContent = "Atualizar Produto";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicateProduct(id) {
  const p = products.find(prod => prod.id === id);
  if (!p) return;

  editingId = null;
  currentImage = p.image || "";
  nameInput.value = `${p.name} (copia)`;
  priceInput.value = p.price;
  oldPriceInput.value = p.oldPrice ?? "";
  shortDescInput.value = p.shortDescription || "";
  descInput.value = p.description || "";
  stockInput.value = p.stock ?? 0;
  categoryInput.value = p.category || "";
  isNew.checked = Boolean(p.isNew);
  isSale.checked = Boolean(p.isSale);
  featuredInput.checked = Boolean(p.featured);

  if (currentImage) {
    imagePreview.src = currentImage;
    imagePreview.style.display = "block";
  }

  form.querySelector("button").textContent = "Salvar Produto";
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  formData.append("imageUrl", currentImage);

  if (imageInput.files.length > 0) {
    formData.append("image", imageInput.files[0]);
  }

  if (editingId) {
    const res = await fetch(`${API_URL}/products/${editingId}`, {
      method: "PUT",
      headers: getAdminHeaders(),
      body: formData
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        logoutAdmin();
        return;
      }
      alert(data.error || "Nao foi possivel atualizar o produto.");
      return;
    }

    editingId = null;
  } else {
    const res = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        logoutAdmin();
        return;
      }
      alert(data.error || "Nao foi possivel criar o produto.");
      return;
    }
  }

  await loadProducts();

  form.reset();
  imagePreview.style.display = "none";
  currentImage = "";
  form.querySelector("button").textContent = "Salvar Produto";
});

if (passwordForm) {
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isAdminAuthenticated()) {
      alert("Acesso negado");
      return;
    }

    setPasswordMessage("");

    const res = await fetch(`${API_URL}/admin/change-password`, {
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

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (data.error === "Senha atual incorreta") {
          setPasswordMessage(data.error, "error");
          return;
        }

        logoutAdmin();
        return;
      }

      setPasswordMessage(data.error || "Nao foi possivel atualizar a senha", "error");
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
