const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001; // Permite que o serviço escolha a porta
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

// =======================
// Middlewares
// =======================
app.use(cors());
app.use(express.json());

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
app.post("/products", (req, res) => {
  const products = readProducts();

  const newProduct = {
    id: Date.now(),
    stock: Number(req.body.stock) || 0,
    ...req.body
  };

  products.push(newProduct);
  saveProducts(products);

  res.status(201).json(newProduct);
});

// PUT → editar produto / estoque
app.put("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const products = readProducts();

  const index = products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Produto não encontrado" });
  }

  products[index] = {
    ...products[index],
    ...req.body,
    id
  };

  saveProducts(products);
  res.json(products[index]);
});

// DELETE → remover produto
app.delete("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const products = readProducts().filter(p => p.id !== id);

  saveProducts(products);
  res.status(204).end();
});

// ROOT
app.get("/", (req, res) => {
  res.send("🚀 API Julia Makeup rodando!");
});

// =======================
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});
