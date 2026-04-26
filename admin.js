/*************************
 * DADOS E ESTADO
 *************************/
let products = [];
let editingId = null;
let currentImage = "";
const API_URL = "https://backend-juliamakeup.onrender.com";
const ADMIN_TOKEN = "julia3535";

const isNew = document.getElementById("isNew");
const isSale = document.getElementById("isSale");

/*************************
 * API
 *************************/
async function loadProducts() {
  const res = await fetch(`${API_URL}/products`);
  products = await res.json();
  renderList(products);
}

/*************************
 * ELEMENTOS DO DOM
 *************************/
const form = document.getElementById("product-form");
const list = document.getElementById("product-list");

const nameInput = document.getElementById("name");
const priceInput = document.getElementById("price");
const imageInput = document.getElementById("image");
const shortDescInput = document.getElementById("shortDescription");
const descInput = document.getElementById("description");
const stockInput = document.getElementById("stock");
const imagePreview = document.getElementById("image-preview");
const adminSearch = document.getElementById("admin-search");

/*************************
 * AUTENTICAÇÃO
 *************************/


function isAdminAuthenticated() {
  return localStorage.getItem("adminAuth") === "true";
}

function loginAdmin() {
  const input = document.getElementById("admin-password");
  const error = document.getElementById("login-error");

  if (input.value === ADMIN_PASSWORD) {
    localStorage.setItem("adminAuth", "true");
    showAdmin();
  } else {
    error.textContent = "Senha incorreta";
  }
}

function logoutAdmin() {
  localStorage.removeItem("adminAuth");
  location.reload();
}

function showAdmin() {
  document.getElementById("admin-login").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
  renderList();
}

function checkAdminAuth() {
  if (isAdminAuthenticated()) {
    showAdmin();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth();
  loadProducts();
});

/*************************
 * RENDERIZA LISTA
 *************************/
function renderList(listToRender = products) {
  list.innerHTML = "";

  if (listToRender.length === 0) {
    list.innerHTML = "<p>Nenhum produto encontrado</p>";
    return;
  }

  listToRender.forEach(p => {
    const div = document.createElement("div");
    div.className = "admin-product";

    div.innerHTML = `
      <strong>${p.name}</strong>
      <p>${p.shortDescription || ""}</p>
      <span>Estoque: ${p.stock}</span>
      <span>R$ ${p.price.toFixed(2)}</span>

      <div class="actions">
        <button onclick="editProduct(${p.id})">Editar</button>
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
  await fetch(`${API_URL}/products/${id}`, {
  method: "DELETE",
});

  loadProducts();
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
  shortDescInput.value = p.shortDescription || "";
  descInput.value = p.description || "";
  stockInput.value = p.stock ?? 0;
  isNew.checked = p.isNew;
  isSale.checked = p.isSale;

  if (currentImage) {
    imagePreview.src = currentImage;
    imagePreview.style.display = "block";
  }

  form.querySelector("button").textContent = "Atualizar Produto";
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
  formData.append("shortDescription", shortDescInput.value);
  formData.append("description", descInput.value);
  formData.append("stock", stockInput.value);
  formData.append("isNew", isNew.checked);
  formData.append("isSale", isSale.checked);

  if (imageInput.files.length > 0) {
    formData.append("image", imageInput.files[0]);
  }

  if (editingId) {
    await fetch(`${API_URL}/products/${editingId}`, {
      method: "PUT",
      headers: {
        Authorization: ADMIN_TOKEN
      },
      body: formData
    });
    editingId = null;
  } else {
    await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: {
        Authorization: ADMIN_TOKEN
      },
      body: formData
    });
  }

  await loadProducts();

  form.reset();
  imagePreview.style.display = "none";
  currentImage = "";
  form.querySelector("button").textContent = "Salvar Produto";
});


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
