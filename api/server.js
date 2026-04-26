const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || "julia3535";

const upload = require("./config/multer");
const cloudinary = require("./config/cloudinary");

const app = express(); // ✅ Declarando o app
const PORT = process.env.PORT || 3001; // Permite que o serviço escolha a porta

// =======================
// Middlewares
// =======================
app.use(cors());
app.use(express.json());

function auth(req, res, next) {
  const token = req.headers.authorization;

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  next();
}

// =======================
// "Banco de dados" (JSON)
// =======================
const PRODUCTS_FILE = path.join(__dirname, "products.json");

function readProducts() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, "[]");
  }
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
}

function saveProducts(data) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
}

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


