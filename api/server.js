const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "julia3535";
const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const upload = require("./config/multer");
const cloudinary = require("./config/cloudinary");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function getAdminPassword() {
  return ADMIN_PASSWORD;
}

function getJwtSecret() {
  return JWT_SECRET;
}

function createAdminToken() {
  const secret = getJwtSecret();

  if (!secret) {
    throw new Error("JWT_SECRET nao configurado");
  }

  return jwt.sign({ role: "admin" }, secret, { expiresIn: "12h" });
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  try {
    const secret = getJwtSecret();

    if (!secret) {
      return res.status(500).json({ error: "JWT_SECRET nao configurado" });
    }

    const payload = jwt.verify(token, secret);

    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sessao invalida ou expirada" });
  }
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function resolveDataFile(filename, fallbackPath) {
  ensureDataDir();

  const dataFile = path.join(DATA_DIR, filename);

  if (!fs.existsSync(dataFile) && fs.existsSync(fallbackPath)) {
    fs.copyFileSync(fallbackPath, dataFile);
  }

  return dataFile;
}

const PRODUCTS_FILE = resolveDataFile(
  "products.json",
  path.join(__dirname, "products.json")
);
const ADMIN_USER_FILE = resolveDataFile(
  "user.json",
  path.join(__dirname, "user.json")
);

function readProductsFile() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, "[]");
  }

  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
}

function saveProductsFile(data) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
}

function readAdminUser() {
  if (!fs.existsSync(ADMIN_USER_FILE)) {
    fs.writeFileSync(ADMIN_USER_FILE, JSON.stringify({}, null, 2));
  }

  const raw = fs.readFileSync(ADMIN_USER_FILE, "utf-8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function saveAdminUser(data) {
  fs.writeFileSync(ADMIN_USER_FILE, JSON.stringify(data, null, 2));
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function getSupabaseRestUrl(pathname = "") {
  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
  const restPath = pathname ? `/${pathname.replace(/^\/+/, "")}` : "";
  return `${baseUrl}/rest/v1${restPath}`;
}

async function supabaseRequest(pathname, options = {}) {
  if (!hasSupabase()) {
    throw new Error("Supabase nao configurado");
  }

  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    ...options.headers
  };

  const res = await fetch(getSupabaseRestUrl(pathname), {
    ...options,
    headers
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "Erro ao consultar Supabase");
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

function mapProductFromStore(product = {}) {
  return {
    id: Number(product.id),
    name: product.name || "",
    price: Number(product.price) || 0,
    shortDescription: product.short_description ?? product.shortDescription ?? "",
    description: product.description || "",
    isNew: product.is_new ?? product.isNew ?? false,
    isSale: product.is_sale ?? product.isSale ?? false,
    stock: Number(product.stock) || 0,
    image: product.image || "",
    imagePublicId: product.image_public_id ?? product.imagePublicId ?? ""
  };
}

function mapProductToStore(product = {}) {
  return {
    id: Number(product.id),
    name: product.name || "",
    price: Number(product.price) || 0,
    short_description: product.shortDescription ?? "",
    description: product.description || "",
    is_new: Boolean(product.isNew),
    is_sale: Boolean(product.isSale),
    stock: Number(product.stock) || 0,
    image: product.image || "",
    image_public_id: product.imagePublicId || ""
  };
}

async function seedSupabaseProductsIfEmpty() {
  const existing = await supabaseRequest("products?select=id&limit=1");

  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const localProducts = readProductsFile();
  if (!localProducts.length) {
    return;
  }

  await supabaseRequest("products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(localProducts.map(mapProductToStore))
  });
}

async function readProductsStore() {
  if (!hasSupabase()) {
    return readProductsFile();
  }

  await seedSupabaseProductsIfEmpty();
  const rows = await supabaseRequest("products?select=*&order=id.asc");
  return rows.map(mapProductFromStore);
}

async function createProductStore(product) {
  if (!hasSupabase()) {
    const products = readProductsFile();
    products.push(product);
    saveProductsFile(products);
    return product;
  }

  const created = await supabaseRequest("products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(mapProductToStore(product))
  });

  return mapProductFromStore(created[0]);
}

async function updateProductStore(id, updates) {
  if (!hasSupabase()) {
    const products = readProductsFile();
    const index = products.findIndex((p) => Number(p.id) === id);
    if (index === -1) return null;
    products[index] = { ...products[index], ...updates, id };
    saveProductsFile(products);
    return products[index];
  }

  const updated = await supabaseRequest(`products?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(mapProductToStore({ id, ...updates }))
  });

  return updated.length ? mapProductFromStore(updated[0]) : null;
}

async function deleteProductStore(id) {
  if (!hasSupabase()) {
    const products = readProductsFile();
    const index = products.findIndex((p) => Number(p.id) === id);
    if (index === -1) return null;
    const [removed] = products.splice(index, 1);
    saveProductsFile(products);
    return removed;
  }

  const deleted = await supabaseRequest(`products?id=eq.${id}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation"
    }
  });

  return deleted.length ? mapProductFromStore(deleted[0]) : null;
}

async function isValidAdminPassword(password) {
  const adminUser = readAdminUser();
  const adminPassword = getAdminPassword();

  if (adminUser.passwordHash) {
    const hashMatches = await bcrypt.compare(password, adminUser.passwordHash);

    if (hashMatches) {
      return true;
    }
  }

  return Boolean(adminPassword) && password === adminPassword;
}

app.post("/admin/login", async (req, res) => {
  const { password } = req.body || {};
  const adminPassword = getAdminPassword();
  const adminUser = readAdminUser();

  if (!adminPassword && !adminUser.passwordHash) {
    return res.status(500).json({ error: "ADMIN_PASSWORD nao configurado" });
  }

  try {
    const isValid = await isValidAdminPassword(password || "");

    if (!isValid) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = createAdminToken();
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao iniciar sessao" });
  }
});

app.get("/admin/session", auth, (req, res) => {
  res.json({ authenticated: true });
});

app.post("/admin/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const adminPassword = getAdminPassword();
  const adminUser = readAdminUser();

  if (!adminPassword && !adminUser.passwordHash) {
    return res.status(500).json({ error: "ADMIN_PASSWORD nao configurado" });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Preencha a senha atual e a nova senha" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres" });
  }

  try {
    const isValid = await isValidAdminPassword(currentPassword);

    if (!isValid) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    saveAdminUser({ passwordHash, updatedAt: new Date().toISOString() });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar senha" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const products = await readProductsStore();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});

app.post("/products", auth, upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      price,
      shortDescription,
      description,
      isNew,
      isSale,
      stock
    } = req.body;

    const product = {
      id: Date.now(),
      name,
      price: Number(price),
      shortDescription,
      description,
      isNew: isNew === "true",
      isSale: isSale === "true",
      stock: Number(stock),
      image: req.file?.path || "",
      imagePublicId: req.file?.filename || ""
    };

    const createdProduct = await createProductStore(product);
    res.status(201).json(createdProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});

app.patch("/products/:id/stock", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const delta = Number(req.body.delta);
    const products = await readProductsStore();

    if (!Number.isFinite(delta)) {
      return res.status(400).json({ error: "Delta de estoque invalido" });
    }

    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Produto nao encontrado" });
    }

    const currentStock = Number(products[index].stock) || 0;
    const nextStock = currentStock + delta;

    if (nextStock < 0) {
      return res.status(400).json({ error: "Estoque insuficiente" });
    }

    const updatedProduct = await updateProductStore(id, {
      ...products[index],
      stock: nextStock
    });

    res.json(updatedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar estoque" });
  }
});

app.put("/products/:id", auth, upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = await readProductsStore();

    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ message: "Produto nao encontrado" });
    }

    const oldProduct = products[index];
    let updatedImage = oldProduct.image;
    let updatedPublicId = oldProduct.imagePublicId;

    if (req.file) {
      if (oldProduct.imagePublicId) {
        await cloudinary.uploader.destroy(oldProduct.imagePublicId);
      }

      updatedImage = req.file.path;
      updatedPublicId = req.file.filename;
    }

    const updatedProduct = {
      ...oldProduct,
      name: req.body.name,
      price: Number(req.body.price),
      shortDescription: req.body.shortDescription,
      description: req.body.description,
      stock: Number(req.body.stock),
      isNew: req.body.isNew === "true",
      isSale: req.body.isSale === "true",
      image: updatedImage,
      imagePublicId: updatedPublicId,
      id
    };

    const savedProduct = await updateProductStore(id, updatedProduct);
    res.json(savedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});

app.delete("/products/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = await readProductsStore();
    const product = products.find((p) => p.id === id);

    if (!product) {
      return res.status(404).json({ error: "Produto nao encontrado" });
    }

    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    await deleteProductStore(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deletar produto" });
  }
});

app.get("/", (req, res) => {
  res.send("API Julia Makeup rodando!");
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
