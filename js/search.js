import { fetchProducts, readCachedProducts, escapeHTML } from './commerce.mjs';

const params = new URLSearchParams(location.search);
const query = (params.get('q') || '').trim();
const input = document.getElementById('resultsSearchInput');
const form = document.getElementById('resultsSearchForm');
const grid = document.getElementById('searchResultsGrid');
const count = document.getElementById('resultsCount');
const heading = document.getElementById('resultsHeading');
const sort = document.getElementById('resultsSort');
let products = [];

input.value = query;
if (query) {
  document.title = `${query} — Search — Trendora`;
  heading.textContent = `Results for “${query}”`;
}

function productImages(product) {
  const values = [product.image, product.imageUrl, ...(Array.isArray(product.images) ? product.images : [])];
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
}

function matchingProducts() {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = products.filter(product => {
    if (!terms.length) return true;
    const searchable = [product.name, product.category, product.description].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
  if (sort.value === 'priceLow') matches.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  if (sort.value === 'priceHigh') matches.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  if (sort.value === 'name') matches.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return matches;
}

function render() {
  const matches = matchingProducts();
  grid.setAttribute('aria-busy', 'false');
  count.textContent = `${matches.length} product${matches.length === 1 ? '' : 's'} found`;
  if (!matches.length) {
    grid.innerHTML = `<div class="search-empty"><span>⌕</span><h3>No matching products</h3><p>Try another product name or explore the complete collection.</p><a href="index.html#collection">View all products</a></div>`;
    return;
  }
  grid.innerHTML = matches.map(product => {
    const image = productImages(product)[0] || '';
    const inStock = Number(product.quantity || 0) > 0;
    return `<article class="search-product">
      <a class="search-product__link" href="product-details.html?id=${encodeURIComponent(product.id)}">
        <div class="search-product__media">
          ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name || 'Product')}" loading="lazy">` : '<span class="image-unavailable">Image unavailable</span>'}
          <span class="search-product__badge ${inStock ? '' : 'out'}">${inStock ? 'In stock' : 'Sold out'}</span>
        </div>
        <div class="search-product__body">
          <span class="search-product__category">${escapeHTML(product.category || 'Everyday edit')}</span>
          <h3>${escapeHTML(product.name || 'Untitled product')}</h3>
          <div class="search-product__bottom"><strong class="search-product__price">₹${Number(product.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span class="search-product__detail">View details ↗</span></div>
        </div>
      </a>
    </article>`;
  }).join('');
  grid.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    image.hidden = true;
    if (!image.parentElement.querySelector('.image-unavailable')) image.insertAdjacentHTML('afterend', '<span class="image-unavailable">Image unavailable</span>');
  }, { once: true }));
}

async function loadProducts() {
  const cached = readCachedProducts({ allowStale: true });
  if (cached.length) {
    products = cached;
    render();
  }
  try {
    products = await fetchProducts();
    render();
  } catch (error) {
    if (products.length) return;
    grid.setAttribute('aria-busy', 'false');
    count.textContent = 'Products unavailable';
    grid.innerHTML = '<div class="search-load-error"><strong>We couldn’t load the collection.</strong><br>Check your connection and try again.<br><button type="button">Try again</button></div>';
    grid.querySelector('button').addEventListener('click', loadProducts);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const nextQuery = input.value.trim();
  location.href = `search.html${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''}`;
});
sort.addEventListener('change', render);
loadProducts();
