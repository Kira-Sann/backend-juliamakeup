const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "julia3535";
const IS_PRODUCTION = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? "" : "local-dev-secret");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const HAS_CLOUDINARY_CONFIG = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

const upload = require("./config/multer");
const cloudinary = require("./config/cloudinary");

const app = express();
const PORT = process.env.PORT || 3001;
const productUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "images", maxCount: 8 }
]);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

function handleProductUpload(req, res, next) {
  productUpload(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    console.error(err);
    const isMulterError = err.name === "MulterError";
    res.status(isMulterError ? 400 : 500).json({
      error: isMulterError ? "Erro no envio da imagem" : "Erro ao processar imagem",
      details: err.message
    });
  });
}

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
  const discounted = hasValidOldPrice(product);
  const images = mergeImageLists(product.images, product.image);
  const imagePublicIds = mergeImageLists(product.image_public_ids, product.image_public_id, product.imagePublicId);

  return {
    id: Number(product.id),
    name: product.name || "",
    price: Number(product.price) || 0,
    oldPrice: product.old_price === null || product.old_price === undefined ? null : Number(product.old_price),
    shortDescription: product.short_description ?? product.shortDescription ?? "",
    description: product.description || "",
    category: product.category || "",
    isNew: product.is_new ?? product.isNew ?? false,
    isSale: Boolean(product.is_sale ?? product.isSale) || discounted,
    featured: Boolean(product.featured ?? product.featuredProduct) || discounted,
    stock: Number(product.stock) || 0,
    image: images[0] || "",
    images,
    imagePublicId: imagePublicIds[0] || "",
    imagePublicIds
  };
}

function normalizeImageList(value) {
  if (!value) return [];

  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => {
      if (!item) return [];
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          if (Array.isArray(parsed)) return parsed;
        } catch (err) {
          // keep raw string below
        }
        return [item];
      }

      return [item];
    })
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function mergeImageLists(...values) {
  return [...new Set(values.flatMap((value) => normalizeImageList(value)))];
}

function normalizeImagePublicIds(value) {
  return normalizeImageList(value);
}

function getRetainedPublicIds(oldImages = [], oldPublicIds = [], retainedImages = []) {
  const retained = new Set(retainedImages);
  return oldPublicIds.filter((publicId, index) => retained.has(oldImages[index]));
}

function hasValidOldPrice(product = {}) {
  const price = Number(product.price) || 0;
  const oldPrice = Number(product.oldPrice ?? product.old_price);

  return Number.isFinite(oldPrice) && oldPrice > price;
}

function mapProductToStore(product = {}) {
  const images = mergeImageLists(product.images, product.image);
  const imagePublicIds = mergeImageLists(product.imagePublicIds, product.imagePublicId);

  // The Supabase table still uses the legacy single-image columns, so we
  // keep the gallery as JSON text there and expand it again when reading.
  return {
    id: Number(product.id),
    name: product.name || "",
    price: Number(product.price) || 0,
    old_price: product.oldPrice ? Number(product.oldPrice) : null,
    short_description: product.shortDescription ?? "",
    description: product.description || "",
    category: product.category || "",
    is_new: Boolean(product.isNew),
    is_sale: Boolean(product.isSale) || hasValidOldPrice(product),
    featured: Boolean(product.featured) || hasValidOldPrice(product),
    stock: Number(product.stock) || 0,
    image: images.length ? JSON.stringify(images) : "",
    image_public_id: imagePublicIds.length ? JSON.stringify(imagePublicIds) : ""
  };
}

function collectUploadedImages(req) {
  const singleImage = req.files?.image?.[0];
  const galleryImages = req.files?.images || [];
  const files = [singleImage, ...galleryImages].filter(Boolean);

  return files.map((file) => ({
    url: file.path && /^https?:\/\//i.test(file.path)
      ? file.path
      : `${req.protocol}://${req.get("host")}/uploads/${file.filename}`,
    publicId: file.filename || ""
  })).filter((entry) => entry.url);
}

async function destroyImagePublicIds(publicIds = []) {
  const ids = normalizeImagePublicIds(publicIds);

  if (HAS_CLOUDINARY_CONFIG) {
    await Promise.all(ids.map((publicId) => cloudinary.uploader.destroy(publicId)));
    return;
  }

  await Promise.all(ids.map(async (filename) => {
    const filepath = path.join(__dirname, "uploads", path.basename(filename));
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
    }
  }));
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

async function readProductStore(id) {
  if (!hasSupabase()) {
    const products = readProductsFile();
    return products.find((product) => Number(product.id) === id) || null;
  }

  await seedSupabaseProductsIfEmpty();
  const rows = await supabaseRequest(`products?id=eq.${id}&select=*&limit=1`);
  return rows.length ? mapProductFromStore(rows[0]) : null;
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

app.get("/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID de produto invalido" });
    }

    const product = await readProductStore(id);

    if (!product) {
      return res.status(404).json({ error: "Produto nao encontrado" });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar produto" });
  }
});

app.post("/products", auth, handleProductUpload, async (req, res) => {
  try {
    const {
      name,
      price,
      oldPrice,
      shortDescription,
      description,
      category,
      isNew,
      isSale,
      featured,
      stock
    } = req.body;

    const uploadedImages = collectUploadedImages(req);
    const imageUrls = uploadedImages.map((item) => item.url);
    const imagePublicIds = uploadedImages.map((item) => item.publicId).filter(Boolean);

    const productImages = mergeImageLists(req.body.existingImages, req.body.imageUrl, imageUrls);

    const product = {
      id: Date.now(),
      name,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
      shortDescription,
      description,
      category,
      isNew: isNew === "true",
      isSale: isSale === "true" || (oldPrice ? Number(oldPrice) > Number(price) : false),
      featured: featured === "true" || (oldPrice ? Number(oldPrice) > Number(price) : false),
      stock: Number(stock),
      image: productImages[0] || "",
      images: productImages,
      imagePublicId: imagePublicIds[0] || "",
      imagePublicIds
    };

    const createdProduct = await createProductStore(product);
    res.status(201).json(createdProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto", details: err.message });
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
    res.status(500).json({ error: "Erro ao atualizar estoque", details: err.message });
  }
});

app.put("/products/:id", auth, handleProductUpload, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = await readProductsStore();

    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ message: "Produto nao encontrado" });
    }

    const oldProduct = products[index];
    const uploadedImages = collectUploadedImages(req);
    const imageUrls = uploadedImages.map((item) => item.url);
    const imagePublicIds = uploadedImages.map((item) => item.publicId).filter(Boolean);
    const oldImages = mergeImageLists(oldProduct.images, oldProduct.image);
    const oldPublicIds = mergeImageLists(oldProduct.imagePublicIds, oldProduct.imagePublicId);
    const retainedImages = Object.prototype.hasOwnProperty.call(req.body, "existingImages")
      ? normalizeImageList(req.body.existingImages)
      : oldImages;
    const retainedPublicIds = getRetainedPublicIds(oldImages, oldPublicIds, retainedImages);
    const removedPublicIds = oldPublicIds.filter((publicId) => !retainedPublicIds.includes(publicId));
    const nextImages = mergeImageLists(retainedImages, imageUrls);
    const nextPublicIds = mergeImageLists(retainedPublicIds, imagePublicIds);

    await destroyImagePublicIds(removedPublicIds);

    const updatedProduct = {
      ...oldProduct,
      name: req.body.name,
      price: Number(req.body.price),
      oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
      shortDescription: req.body.shortDescription,
      description: req.body.description,
      category: req.body.category,
      stock: Number(req.body.stock),
      isNew: req.body.isNew === "true",
      isSale: req.body.isSale === "true" || (req.body.oldPrice ? Number(req.body.oldPrice) > Number(req.body.price) : false),
      featured: req.body.featured === "true" || (req.body.oldPrice ? Number(req.body.oldPrice) > Number(req.body.price) : false),
      image: nextImages[0] || "",
      images: nextImages,
      imagePublicId: nextPublicIds[0] || "",
      imagePublicIds: nextPublicIds,
      id
    };

    const savedProduct = await updateProductStore(id, updatedProduct);
    res.json(savedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar produto", details: err.message });
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

    await destroyImagePublicIds(mergeImageLists(product.imagePublicIds, product.imagePublicId));

    await deleteProductStore(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deletar produto", details: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("API Julia Makeup rodando!");
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({
    error: "Erro interno no servidor",
    details: err.message
  });
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
