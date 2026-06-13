const PRODUCT_PAGE_LOCAL_API_URL = "http://localhost:3001";
const PRODUCT_PAGE_REMOTE_API_URL = "https://backend-juliamakeup.onrender.com";
let PRODUCT_PAGE_API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? PRODUCT_PAGE_LOCAL_API_URL
  : PRODUCT_PAGE_REMOTE_API_URL;

async function productPageFetchWithFallback(path, options) {
  try {
    const response = await fetch(`${PRODUCT_PAGE_API_URL}${path}`, options);
    if (!response.ok) throw new Error(`API respondeu ${response.status}`);
    return response;
  } catch (error) {
    if (PRODUCT_PAGE_API_URL !== PRODUCT_PAGE_LOCAL_API_URL) throw error;

    PRODUCT_PAGE_API_URL = PRODUCT_PAGE_REMOTE_API_URL;
    const fallbackResponse = await fetch(`${PRODUCT_PAGE_API_URL}${path}`, options);
    if (!fallbackResponse.ok) throw new Error(`API respondeu ${fallbackResponse.status}`);
    return fallbackResponse;
  }
}

function productPageNormalizeText(text = "") {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function productPageToBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function productPageToOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function productPageHasValidOldPrice(product) {
  return Boolean(product.oldPrice && product.oldPrice > product.price);
}

function productPageIsFeatured(product) {
  return Boolean(product.featured || productPageHasValidOldPrice(product));
}

function productPageIsSale(product) {
  return Boolean(product.isSale || productPageHasValidOldPrice(product));
}

function productPageGetImage(product) {
  const images = productPageMergeImageLists(product.images, product.image);
  return images[0] || product.image || "img/julia_logo.png";
}

function productPageNormalizeImageList(value) {
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

function productPageMergeImageLists(...values) {
  return [...new Set(values.flatMap((value) => productPageNormalizeImageList(value)))];
}

function productPageFormatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function productPagePlainText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productPageTruncate(value = "", maxLength = 155) {
  const text = productPagePlainText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function productPageEscapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function productPageGetShortDescription(product) {
  const shortDescription = productPagePlainText(product.shortDescription);
  if (shortDescription) return shortDescription;

  const fullDescription = productPagePlainText(product.description);
  if (fullDescription) return productPageTruncate(fullDescription, 150);

  return "Sem descricao curta disponivel.";
}

function productPageShouldShowFullDescription(product) {
  const fullDescription = productPagePlainText(product.description);
  const shortDescription = productPagePlainText(product.shortDescription);

  if (!fullDescription) return false;
  if (!shortDescription) return fullDescription.length > 150;

  return productPageNormalizeText(fullDescription) !== productPageNormalizeText(shortDescription);
}

function productPageRenderFullDescription(product) {
  if (!productPageShouldShowFullDescription(product)) return "";

  const fullDescription = productPagePlainText(product.description);

  return `
    <details class="product-full-description">
      <summary>
        <span>
          <strong>Descrição completa</strong>
          <small>Ver detalhes completos do produto</small>
        </span>
        <i class="fa-solid fa-chevron-down"></i>
      </summary>
      <div class="product-full-description-body">
        <p>${productPageEscapeHtml(fullDescription)}</p>
      </div>
    </details>
  `;
}

function productPageAbsoluteUrl(value) {
  try {
    return new URL(value || "img/julia_logo.png", window.location.href).href;
  } catch (err) {
    return value || "";
  }
}

function productPageSetMeta(id, attribute, value) {
  const element = document.getElementById(id);
  if (!element || !value) return;
  element.setAttribute(attribute, value);
}

function productPageGetSeoDescription(product) {
  return productPageTruncate(
    product.description ||
    product.shortDescription ||
    `${product.name} por ${productPageFormatMoney(product.price)} na Morango Makeup.`
  );
}

function productPageUpdateSeo(product) {
  const title = `${product.name} - Morango Makeup`;
  const description = productPageGetSeoDescription(product);
  const image = productPageAbsoluteUrl(productPageGetImage(product));
  const url = productPageAbsoluteUrl(`product.html?id=${product.id}`);
  const galleryImages = productPageMergeImageLists(product.images, product.image)
    .map((item) => productPageAbsoluteUrl(item));

  document.title = title;
  productPageSetMeta("product-meta-description", "content", description);
  productPageSetMeta("product-canonical", "href", url);
  productPageSetMeta("product-og-title", "content", title);
  productPageSetMeta("product-og-description", "content", description);
  productPageSetMeta("product-og-image", "content", image);
  productPageSetMeta("product-og-url", "content", url);
  productPageSetMeta("product-og-price", "content", Number(product.price || 0).toFixed(2));
  productPageSetMeta("product-og-availability", "content", product.stock > 0 ? "in stock" : "out of stock");
  productPageSetMeta("product-twitter-title", "content", title);
  productPageSetMeta("product-twitter-description", "content", description);
  productPageSetMeta("product-twitter-image", "content", image);

  const structuredData = document.getElementById("product-structured-data");
  if (structuredData) {
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: galleryImages.length ? galleryImages : [image],
      description,
      sku: String(product.id),
      category: product.category || undefined,
      brand: {
        "@type": "Brand",
        name: "Morango Makeup"
      },
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "BRL",
        price: Number(product.price || 0).toFixed(2),
        availability: product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition"
      }
    });
  }
}

function productPageGetId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

function productPageMapProduct(product = {}) {
  const price = Number(product.price) || 0;
  const oldPrice = productPageToOptionalNumber(product.oldPrice);

  return {
    ...product,
    id: Number(product.id),
    price,
    oldPrice,
    stock: Number(product.stock) || 0,
    category: productPageNormalizeText(product.category || ""),
    shortDescription: product.shortDescription || "",
    description: product.description || "",
    isNew: productPageToBoolean(product.isNew),
    isSale: productPageToBoolean(product.isSale) || Boolean(oldPrice && oldPrice > price),
    featured: productPageToBoolean(product.featured) || Boolean(oldPrice && oldPrice > price)
  };
}

function productPageGetRelatedProducts(products, currentProduct) {
  const sameCategory = products
    .filter((item) => item.id !== currentProduct.id)
    .filter((item) => item.category === currentProduct.category);

  const pool = sameCategory.length ? sameCategory : products.filter((item) => item.id !== currentProduct.id);

  return pool
    .map((item) => ({
      ...item,
      score: Math.abs(item.price - currentProduct.price) + (item.category === currentProduct.category ? 0 : 200)
    }))
    .sort((a, b) => a.score - b.score || Number(productPageIsFeatured(b)) - Number(productPageIsFeatured(a)))
    .slice(0, 4);
}

function productPageRenderBadges(product) {
  const badges = [];
  if (productPageIsFeatured(product)) badges.push('<span class="badge badge-featured">Destaque</span>');
  if (product.isNew) badges.push('<span class="badge badge-new">Novo</span>');
  if (productPageIsSale(product)) badges.push('<span class="badge badge-sale">Promoção</span>');
  return badges.join("");
}

function productPageRenderRelated(products, currentProduct) {
  const relatedSection = document.getElementById("related-section");
  const relatedContainer = document.getElementById("related-products");

  const related = productPageGetRelatedProducts(products, currentProduct);

  if (!relatedContainer || !relatedSection) return;

  if (!related.length) {
    relatedSection.hidden = true;
    return;
  }

  relatedSection.hidden = false;
  relatedContainer.innerHTML = related.map((item) => `
    <article class="related-card">
      <img src="${productPageGetImage(item)}" alt="${item.name}" onerror="this.onerror=null;this.src='img/julia_logo.png';">
      <div class="detail-badges">${productPageRenderBadges(item)}</div>
      <h4>${item.name}</h4>
      <span>${productPageFormatMoney(item.price)}</span>
      <a href="product.html?id=${item.id}">Ver produto</a>
    </article>
  `).join("");
}

function productPageRenderGallery(product) {
  const images = productPageMergeImageLists(product.images, product.image);
  const galleryImages = images.length ? images : [productPageGetImage(product)];

  return `
    <div class="detail-gallery">
      <div class="detail-gallery-main" data-current-index="0">
        <img id="detail-main-image" src="${galleryImages[0]}" alt="${product.name}" onerror="this.onerror=null;this.src='img/julia_logo.png';">
        ${galleryImages.length > 1 ? `
          <button type="button" class="detail-gallery-nav detail-gallery-prev" onclick="productPageStepImage(-1)" aria-label="Imagem anterior">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <button type="button" class="detail-gallery-nav detail-gallery-next" onclick="productPageStepImage(1)" aria-label="Próxima imagem">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <span class="detail-gallery-count" id="detail-gallery-count">1 / ${galleryImages.length}</span>
        ` : ""}
      </div>
      ${galleryImages.length > 1 ? `
        <div class="detail-gallery-thumbs">
          ${galleryImages.map((image, index) => `
            <button type="button" class="detail-thumb ${index === 0 ? "active" : ""}" data-image="${image}" data-index="${index}" onclick="productPageSetImage(${index})">
              <img src="${image}" alt="${product.name} - imagem ${index + 1}" onerror="this.onerror=null;this.src='img/julia_logo.png';">
            </button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function productPageRenderDetail(product, products) {
  const container = document.getElementById("product-detail");
  if (!container) return;

  const oldPrice = productPageHasValidOldPrice(product) ? product.oldPrice : null;
  const shortDescription = productPageGetShortDescription(product);
  const fullDescription = productPageRenderFullDescription(product);
  container.classList.remove("detail-loading", "detail-skeleton");

  container.innerHTML = `
    <div class="detail-card">
      ${productPageRenderGallery(product)}
      <div class="detail-content">
        <div class="detail-main-info">
          <div class="detail-badges">
            ${productPageRenderBadges(product)}
          </div>
          <h1 class="detail-title">${product.name}</h1>
          <div class="detail-price">
            ${oldPrice ? `<span class="detail-old-price">${productPageFormatMoney(oldPrice)}</span>` : ""}
            <span class="detail-current-price">${productPageFormatMoney(product.price)}</span>
          </div>
          <p class="detail-description">${productPageEscapeHtml(shortDescription)}</p>
        </div>
        <div class="detail-actions" aria-label="Acoes do produto">
          <div class="detail-meta">
            <span>Categoria: ${productPageEscapeHtml(product.category || "geral")}</span>
            <span>Estoque: ${Number(product.stock) || 0}</span>
            ${product.stock > 0 ? '<span>Pronto para envio</span>' : '<span>Fora de estoque</span>'}
          </div>
          ${product.stock > 0 ? `
            <div class="detail-primary-actions">
              <button class="detail-action-btn detail-add-btn" onclick="addToCart(${product.id})"><i class="fa-solid fa-cart-plus"></i> Adicionar ao carrinho</button>
              <button class="detail-action-btn detail-buy-btn" onclick="buyNow(${product.id})"><i class="fa-brands fa-whatsapp"></i> Comprar agora</button>
            </div>
          ` : ""}
          <div class="detail-secondary-actions">
            <button class="detail-action-btn detail-quiet-btn" onclick="toggleFavorite(${product.id})"><i class="fa-solid fa-heart"></i> Favoritar</button>
            <button class="detail-action-btn detail-quiet-btn" onclick="shareProduct(${product.id})"><i class="fa-solid fa-share-nodes"></i> Compartilhar</button>
            <a class="detail-link-btn detail-quiet-btn" href="index.html#products-section"><i class="fa-solid fa-arrow-left"></i> Voltar para a loja</a>
          </div>
        </div>
      </div>
    </div>
    ${fullDescription}
  `;

  productPageRenderRelated(products, product);
}

function productPageSetImage(index) {
  const mainImage = document.getElementById("detail-main-image");
  const thumbs = document.querySelectorAll(".detail-thumb");
  const galleryMain = document.querySelector(".detail-gallery-main");
  const counter = document.getElementById("detail-gallery-count");

  if (!mainImage || !thumbs.length) return;

  const normalizedIndex = (index + thumbs.length) % thumbs.length;
  const activeThumb = thumbs[normalizedIndex];
  const imageUrl = activeThumb?.dataset.image;

  if (!imageUrl) return;

  mainImage.src = imageUrl;
  if (galleryMain) galleryMain.dataset.currentIndex = String(normalizedIndex);
  if (counter) counter.textContent = `${normalizedIndex + 1} / ${thumbs.length}`;

  thumbs.forEach((button) => {
    button.classList.toggle("active", button.dataset.image === imageUrl);
  });
}

function productPageStepImage(direction) {
  const galleryMain = document.querySelector(".detail-gallery-main");
  const currentIndex = Number(galleryMain?.dataset.currentIndex || 0);
  productPageSetImage(currentIndex + direction);
}

function productPageSwapImage(imageUrl) {
  const thumbs = Array.from(document.querySelectorAll(".detail-thumb"));
  const index = thumbs.findIndex((button) => button.dataset.image === imageUrl);
  productPageSetImage(index === -1 ? 0 : index);
}

function productPageSyncMainProducts(product) {
  try {
    if (typeof products === "undefined" || !Array.isArray(products)) return;

    const index = products.findIndex((item) => Number(item.id) === Number(product.id));
    if (index === -1) {
      products.push(product);
      return;
    }

    products[index] = product;
  } catch (err) {
    // main.js may not be present in isolated tests.
  }
}

async function productPageLoadProduct(productId) {
  try {
    const res = await productPageFetchWithFallback(`/products/${productId}?nocache=${Date.now()}`);
    const product = await res.json();
    return productPageMapProduct(product);
  } catch (err) {
    const catalog = await productPageLoadProducts();
    return catalog.find((item) => item.id === productId) || null;
  }
}

async function productPageLoadProducts() {
  if (typeof loadProducts === "function") {
    const sharedProducts = await loadProducts();
    if (Array.isArray(sharedProducts) && sharedProducts.length) {
      return sharedProducts.map(productPageMapProduct);
    }
  }

  const res = await productPageFetchWithFallback(`/products?nocache=${Date.now()}`);
  const data = await res.json();
  return data.map(productPageMapProduct);
}

async function productPageLoadRelated(currentProduct) {
  try {
    const catalog = await productPageLoadProducts();
    productPageRenderRelated(catalog, currentProduct);
  } catch (err) {
    productPageRenderRelated([], currentProduct);
  }
}

async function productPageLoad() {
  const productId = productPageGetId();
  const container = document.getElementById("product-detail");

  if (!Number.isFinite(productId) || productId <= 0) {
    if (container) {
      container.classList.remove("detail-loading", "detail-skeleton");
      container.innerHTML = `
        <div class="empty-state-card">
          <h3>Produto não encontrado</h3>
          <p>Abra a página a partir da vitrine para carregar um item válido.</p>
          <div class="empty-state-actions">
            <a class="reset-filters-btn" href="index.html#products-section">Voltar para a vitrine</a>
          </div>
        </div>
      `;
    }
    return;
  }

  try {
    const currentProduct = await productPageLoadProduct(productId);

    if (!currentProduct) {
      if (container) {
        container.classList.remove("detail-loading", "detail-skeleton");
        container.innerHTML = `
          <div class="empty-state-card">
            <h3>Produto não encontrado</h3>
            <p>Esse item não existe mais ou foi removido do catálogo.</p>
            <div class="empty-state-actions">
              <a class="reset-filters-btn" href="index.html#products-section">Voltar para a vitrine</a>
            </div>
          </div>
        `;
      }
      return;
    }

    productPageSyncMainProducts(currentProduct);
    productPageUpdateSeo(currentProduct);
    productPageRenderDetail(currentProduct, [currentProduct]);
    productPageLoadRelated(currentProduct);
  } catch (err) {
    console.error(err);
    if (container) {
      container.classList.remove("detail-loading", "detail-skeleton");
      container.innerHTML = `
        <div class="empty-state-card">
          <h3>Não foi possível carregar o produto</h3>
          <p>Verifique a conexão com a API e tente novamente.</p>
        </div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
  productPageLoad();
});
