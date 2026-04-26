const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

const upload = require("./config/multer");
const cloudinary = require("./config/cloudinary");

const app = express(); // ✅ Declarando o app
const PORT = process.env.PORT || 3001; // Permite que o serviço escolha a porta

// =======================
// Middlewares
// =======================
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

// =======================
// "Banco de dados" (JSON)
// =======================
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const ADMIN_USER_FILE = path.join(__dirname, "user.json");

function readProducts() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, "[]");
  }
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
}

function saveProducts(data) {
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

async function isValidAdminPassword(password) {
  const adminUser = readAdminUser();

  if (adminUser.passwordHash) {
    return bcrypt.compare(password, adminUser.passwordHash);
  }

  const adminPassword = getAdminPassword();
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

// =======================
// ROTAS
// =======================

// GET → listar produtos
app.get("/products", (req, res) => {
  const products = readProducts();
  res.json(products);
});

// POST → criar produto
app.post("/products", auth, upload.single("image"), async (req, res) => {
  try {
    const products = readProducts();

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

    products.push(product);
    saveProducts(products); // ✅ FALTAVA ISSO

    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});


// PUT → editar produto / estoque
app.patch("/products/:id/stock", (req, res) => {
  try {
    const id = Number(req.params.id);
    const delta = Number(req.body.delta);
    const products = readProducts();

    if (!Number.isFinite(delta)) {
      return res.status(400).json({ error: "Delta de estoque invalido" });
    }

    const index = products.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Produto nao encontrado" });
    }

    const currentStock = Number(products[index].stock) || 0;
    const nextStock = currentStock + delta;

    if (nextStock < 0) {
      return res.status(400).json({ error: "Estoque insuficiente" });
    }

    products[index].stock = nextStock;
    saveProducts(products);

    res.json(products[index]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar estoque" });
  }
});

app.put("/products/:id", auth, upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = readProducts();

    const index = products.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ message: "Produto não encontrado" });
    }

    const oldProduct = products[index];

    let updatedImage = oldProduct.image;
    let updatedPublicId = oldProduct.imagePublicId;

    // 👉 Se enviou nova imagem
    if (req.file) {
      // 🔥 deleta antiga
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

    products[index] = updatedProduct;
    saveProducts(products);

    res.json(updatedProduct);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});

// DELETE → remover produto
app.delete("/products/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = readProducts(); // ✅ FALTAVA

    const index = products.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    const product = products[index];

    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    products.splice(index, 1);
    saveProducts(products);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao deletar produto" });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("🚀 API Julia Makeup rodando!");
});

// =======================
// Start do servidor
// =======================
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});


