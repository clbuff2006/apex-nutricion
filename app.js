'use strict';

/* ---------- Cache-busting de fotos de producto ----------
   Los archivos de foto se reemplazan manteniendo el mismo nombre, así que el
   navegador puede seguir mostrando una copia vieja en caché. Subir este número
   cada vez que se reemplacen fotos de producto fuerza a descargar la versión
   nueva en vez de servir la cacheada. */
const IMG_V = 10;
function withImgV(src){
  if(!src) return src;
  return src.split('?')[0] + '?v=' + IMG_V;
}
function initImageCacheBust(){
  document.querySelectorAll('img[src^="assets/"]').forEach(function(img){
    img.src = withImgV(img.src);
  });
}

/* ---------- Tasa BCV (Banco Central de Venezuela) ---------- */
const BCV_CACHE_KEY = 'apex_bcv_rate';
let bcvRate = null; // Bs por $1, null hasta que se obtenga (o si falla)

function todayCaracas(){
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }); // YYYY-MM-DD
}

function loadCachedBcvRate(){
  try {
    const raw = localStorage.getItem(BCV_CACHE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(parsed && parsed.cachedDate === todayCaracas() && typeof parsed.rate === 'number') return parsed.rate;
    return null;
  } catch(e){ return null; }
}

function saveCachedBcvRate(rate){
  try {
    localStorage.setItem(BCV_CACHE_KEY, JSON.stringify({ rate: rate, cachedDate: todayCaracas() }));
  } catch(e){ /* localStorage no disponible, no es crítico */ }
}

function fetchBcvRate(){
  const cached = loadCachedBcvRate();
  if(cached != null){
    bcvRate = cached;
    return Promise.resolve(bcvRate);
  }
  return fetch('https://ve.dolarapi.com/v1/dolares/oficial')
    .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data){
      const rate = Number(data && data.promedio);
      if(!rate || isNaN(rate)) throw new Error('Tasa inválida');
      bcvRate = rate;
      saveCachedBcvRate(rate);
      return bcvRate;
    })
    .catch(function(err){
      console.error('No se pudo obtener la tasa BCV: ' + err);
      bcvRate = null;
      return null;
    });
}

function formatBsNumber(usdAmount){
  if(bcvRate == null || usdAmount == null || isNaN(usdAmount)) return null;
  const bs = usdAmount * bcvRate;
  const parts = bs.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts[0] + ',' + parts[1];
}

function parsePriceText(text){
  if(!text) return null;
  const match = String(text).match(/\$\s*([\d.,]+)/);
  if(!match) return null;
  const num = parseFloat(match[1].replace(',', '.'));
  return isNaN(num) ? null : num;
}

/* Agrega "≈ Bs ..." debajo del precio en cada tarjeta de producto (catálogo, home, búsqueda) */
function injectProductCardBsPrices(){
  if(bcvRate == null) return;
  document.querySelectorAll('.product-card .product-price').forEach(function(el){
    let usdSpan = el.querySelector('.product-price-usd');
    if(!usdSpan){
      const text = el.textContent;
      el.innerHTML = '';
      usdSpan = document.createElement('span');
      usdSpan.className = 'product-price-usd';
      usdSpan.textContent = text;
      el.appendChild(usdSpan);
    }
    const usd = parsePriceText(usdSpan.textContent);
    const bsFormatted = formatBsNumber(usd);
    if(bsFormatted == null) return;
    let bsSpan = el.querySelector('.product-price-bs');
    if(!bsSpan){
      bsSpan = document.createElement('span');
      bsSpan.className = 'product-price-bs';
      el.appendChild(bsSpan);
    }
    bsSpan.textContent = '≈ Bs ' + bsFormatted;
  });
}

/* Agrega "≈ Bs ... · Tasa BCV: Bs ..." debajo del precio en la ficha de producto (PDP) */
function injectPdpBsPrice(){
  if(bcvRate == null) return;
  const priceEl = document.getElementById('pdp-price');
  const bsEl = document.getElementById('pdp-price-bs');
  if(!priceEl || !bsEl) return;
  const usd = parsePriceText(priceEl.textContent);
  const bsFormatted = formatBsNumber(usd);
  if(bsFormatted == null) return;
  bsEl.textContent = '≈ Bs ' + bsFormatted + ' · Tasa BCV: Bs ' + formatBsNumber(1);
}

/* ---------- Carrito real (localStorage) ---------- */
const CART_STORAGE_KEY = 'apex_cart';

function getCart(){
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){
    return [];
  }
}

function saveCart(cart){
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch(e){
    console.error('No se pudo guardar el carrito: ' + e);
  }
}

function cartTotalQty(cart){
  return cart.reduce(function(sum, item){ return sum + item.quantity; }, 0);
}

function initCartCount(){
  const totalQty = cartTotalQty(getCart());
  document.querySelectorAll('[data-cart-count]').forEach(function(el){
    el.textContent = totalQty;
  });
}

/* Agrega un producto al carrito real, combinando cantidad si ya existe la misma variante. */
function addItemToCart(item){
  const cart = getCart();
  const existing = cart.find(function(c){ return c.name === item.name && c.brand === item.brand && c.variant === item.variant; });
  if(existing){
    existing.quantity = Math.min(10, existing.quantity + item.quantity);
  } else {
    cart.push({ name: item.name, brand: item.brand, photo: item.photo, variant: item.variant, unitPrice: item.unitPrice, quantity: Math.min(10, item.quantity) });
  }
  saveCart(cart);
  initCartCount();
}

/* Lee el producto/precio/foto actuales de la ficha (ya reflejan el sabor/presentación elegidos) y lo agrega al carrito real. */
function addProductToCart(quantity){
  const titleEl = document.getElementById('pdp-main-title');
  const priceEl = document.getElementById('pdp-price');
  const brandEl = document.querySelector('.pdp-brand');
  const photoEl = document.getElementById('pdp-main-photo');
  const unitEl = document.querySelector('.pdp-price-unit');
  if(!titleEl || !priceEl) return;

  addItemToCart({
    name: titleEl.textContent.trim(),
    brand: brandEl ? brandEl.textContent.trim() : '',
    photo: photoEl ? photoEl.src : '',
    variant: unitEl ? unitEl.textContent.trim() : '',
    unitPrice: parseFloat(priceEl.textContent.replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0,
    quantity: quantity
  });
}

/* Lee el producto/precio/foto de una tarjeta de catálogo y lo agrega al carrito real. */
function addCardToCart(card){
  if(!card) return;
  const nameEl = card.querySelector('.product-name');
  const priceEl = card.querySelector('.product-price');
  const brandEl = card.querySelector('.product-brand');
  const photoEl = card.querySelector('.product-photo');
  if(!nameEl || !priceEl) return;

  addItemToCart({
    name: nameEl.textContent.trim(),
    brand: brandEl ? brandEl.textContent.trim() : '',
    photo: photoEl ? photoEl.src : '',
    variant: '',
    unitPrice: parsePriceText(priceEl.textContent) || 0,
    quantity: 1
  });
}

/* ---------- Botón "Agregar al carrito" en las tarjetas de catálogo ---------- */
function initCardAddToCartButtons(){
  document.querySelectorAll('[data-add-to-cart-card]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      addCardToCart(btn.closest('.product-card'));
      btn.classList.add('added');
      const label = btn.textContent;
      btn.textContent = 'Agregado ✓';
      setTimeout(function(){ btn.textContent = label; btn.classList.remove('added'); }, 1400);
    });
  });
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Mega menú (escritorio) ---------- */
function initMegaMenu(){
  const items = document.querySelectorAll('.nav-item.has-mega');
  items.forEach(function(item){
    let closeTimer = null;
    const trigger = item.querySelector('.nav-trigger');

    function open(){
      clearTimeout(closeTimer);
      items.forEach(function(other){ if(other !== item) other.classList.remove('open'); });
      item.classList.add('open');
      if(trigger) trigger.setAttribute('aria-expanded', 'true');
    }
    function close(){
      closeTimer = setTimeout(function(){
        item.classList.remove('open');
        if(trigger) trigger.setAttribute('aria-expanded', 'false');
      }, 120);
    }

    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', close);
    item.addEventListener('focusin', open);
    item.addEventListener('focusout', function(e){
      if(!item.contains(e.relatedTarget)) close();
    });

    if(trigger){
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', function(){
        const isOpen = item.classList.contains('open');
        items.forEach(function(other){ other.classList.remove('open'); });
        if(!isOpen){ item.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
        else { trigger.setAttribute('aria-expanded', 'false'); }
      });
    }
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      items.forEach(function(item){ item.classList.remove('open'); });
    }
  });
}

/* ---------- Menú móvil ---------- */
function initMobileMenu(){
  const toggle = document.querySelector('.menu-toggle');
  const panel = document.querySelector('.mobile-nav');
  if(!toggle || !panel) return;

  toggle.addEventListener('click', function(){
    const isOpen = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });
}

/* ---------- Boletín ---------- */
function initNewsletterForms(){
  document.querySelectorAll('[data-newsletter-form]').forEach(function(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      const success = form.querySelector('[data-newsletter-success]');
      const input = form.querySelector('input[type="email"]');
      if(success){ success.classList.add('visible'); }
      if(input){ input.value = ''; }
    });
  });
}

/* ---------- Botón "Agregar al carrito" ---------- */
function initAddToCartButtons(){
  document.querySelectorAll('[data-add-to-cart]').forEach(function(btn){
    btn.addEventListener('click', function(){
      addProductToCart(1);
    });
  });
}

/* ---------- Filtros y orden de categoría ---------- */
function initFiltersToggle(){
  const toggle = document.querySelector('.filters-toggle');
  const panel = document.getElementById('filters-panel');
  if(!toggle || !panel) return;

  toggle.addEventListener('click', function(){
    const isOpen = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

function parseRange(value){
  const parts = value.split('-').map(Number);
  const min = parts[0];
  const max = parts.length > 1 ? parts[1] : parts[0];
  return { min: min, max: max };
}

const CATEGORY_META = {
  hidratacion: {
    title: 'Hidratación',
    subtitle: 'Electrolitos en polvo, masticables y cápsulas para reponer lo que pierdes por el sudor.',
  },
  proteina: {
    title: 'Proteína',
    subtitle: 'Polvos de proteína para la ventana de recuperación después de entrenar.',
  },
  recuperacion: {
    title: 'Recuperación',
    subtitle: 'Barras energéticas para reponer después del esfuerzo.',
  },
  'geles-energia': {
    title: 'Geles y energía',
    subtitle: 'Geles, waffles y gomas para sostener el ritmo antes, durante y después del entrenamiento. Filtra por cafeína, carbohidratos y sodio por porción para comparar de verdad.',
  },
};

function initCategoryFilters(){
  const grid = document.getElementById('product-grid');
  if(!grid) return;

  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const countEl = document.getElementById('result-count');
  const emptyEl = document.getElementById('cat-empty');
  const sortSelect = document.getElementById('sort-select');
  const clearBtn = document.getElementById('clear-filters');
  const checkboxes = Array.from(document.querySelectorAll('.filters input[type="checkbox"]'));
  const numericGroups = ['caffeine', 'carbs', 'sodium', 'price'];

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get('cat');
  const activeSub = params.get('sub');
  const meta = activeCategory && CATEGORY_META[activeCategory];

  const titleEl = document.getElementById('cat-title');
  const subtitleEl = document.getElementById('cat-subtitle');
  const breadcrumbEl = document.getElementById('cat-breadcrumb');
  if(meta){
    if(titleEl) titleEl.textContent = meta.title;
    if(subtitleEl) subtitleEl.textContent = meta.subtitle;
    if(breadcrumbEl) breadcrumbEl.textContent = meta.title;
    document.title = meta.title + ' | Apex Nutrición';
  } else if(activeCategory === null && document.getElementById('cat-title')){
    if(titleEl) titleEl.textContent = 'Catálogo completo';
    if(subtitleEl) subtitleEl.textContent = 'Todo lo que tenemos disponible: geles, hidratación, proteína y barras de las cinco marcas.';
    if(breadcrumbEl) breadcrumbEl.textContent = 'Catálogo completo';
  }

  function categoryOk(card){
    return !meta || card.dataset.category === activeCategory;
  }

  function matchesGroup(card, group, selectedValues){
    if(selectedValues.length === 0) return true;
    if(numericGroups.indexOf(group) !== -1){
      const raw = parseFloat(card.dataset[group]);
      return selectedValues.some(function(v){
        const range = parseRange(v);
        return raw >= range.min && raw <= range.max;
      });
    }
    if(group === 'sport'){
      const sports = (card.dataset.sport || '').split(' ');
      return selectedValues.some(function(v){ return sports.indexOf(v) !== -1; });
    }
    return selectedValues.indexOf(card.dataset[group]) !== -1;
  }

  function updateFacetCounts(){
    const scoped = cards.filter(categoryOk);
    document.querySelectorAll('[data-count-for]').forEach(function(span){
      const parts = span.dataset.countFor.split(':');
      const group = parts[0];
      const value = parts.slice(1).join(':');
      const count = scoped.filter(function(card){ return matchesGroup(card, group, [value]); }).length;
      span.textContent = count;
    });
  }

  function applyFilters(){
    const selected = {};
    checkboxes.forEach(function(cb){
      if(cb.checked){
        const g = cb.dataset.filterGroup;
        selected[g] = selected[g] || [];
        selected[g].push(cb.value);
      }
    });

    const groups = ['brand', 'format', 'caffeine', 'carbs', 'sodium', 'sport', 'price'];
    let visibleCount = 0;
    cards.forEach(function(card){
      const match = categoryOk(card) && groups.every(function(g){ return matchesGroup(card, g, selected[g] || []); });
      card.style.display = match ? '' : 'none';
      if(match) visibleCount++;
    });

    if(countEl) countEl.textContent = visibleCount;
    if(emptyEl) emptyEl.hidden = visibleCount !== 0;
    grid.hidden = visibleCount === 0;
  }

  updateFacetCounts();

  function applySort(){
    const value = sortSelect.value;
    const sorted = cards.slice().sort(function(a, b){
      switch(value){
        case 'price-asc': return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
        case 'price-desc': return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
        case 'rating': return parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating);
        case 'carbs': return parseFloat(b.dataset.carbs) - parseFloat(a.dataset.carbs);
        case 'sodium': return parseFloat(b.dataset.sodium) - parseFloat(a.dataset.sodium);
        case 'newest': return (b.dataset.new === 'true' ? 1 : 0) - (a.dataset.new === 'true' ? 1 : 0);
        default:
          return (b.dataset.bestseller === 'true' ? 1 : 0) - (a.dataset.bestseller === 'true' ? 1 : 0)
            || parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating);
      }
    });
    sorted.forEach(function(card){ grid.appendChild(card); });
  }

  checkboxes.forEach(function(cb){ cb.addEventListener('change', applyFilters); });
  if(sortSelect) sortSelect.addEventListener('change', applySort);
  if(clearBtn){
    clearBtn.addEventListener('click', function(){
      checkboxes.forEach(function(cb){ cb.checked = false; });
      applyFilters();
    });
  }

  applyFilters();

  // Si el cliente entró desde un enlace de subcategoría (ej. "Gomas" dentro de Geles y energía),
  // esos productos se muestran primero, y el resto de la categoría queda debajo.
  if(activeSub){
    const prioritized = cards.slice().sort(function(a, b){
      const aFirst = a.dataset.format === activeSub ? 0 : 1;
      const bFirst = b.dataset.format === activeSub ? 0 : 1;
      return aFirst - bFirst;
    });
    prioritized.forEach(function(card){ grid.appendChild(card); });
  }
}

/* ---------- Tabla nutricional dinámica por sabor ---------- */
function applyNutrition(el){
  if(!el || !el.dataset.nutrition) return;
  const tbody = document.querySelector('.nutrition-table tbody');
  if(!tbody) return;
  let rows;
  try{ rows = JSON.parse(el.dataset.nutrition); } catch(e){ return; }
  tbody.innerHTML = rows.map(function(r){
    return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
  }).join('');
}

/* ---------- Selector de sabor de la ficha de producto (miniaturas + píldoras + foto principal) ---------- */
function initPdpFlavorSelector(){
  const groups = Array.from(document.querySelectorAll('[data-flavor-group]'));
  if(groups.length === 0) return;

  const mainPhoto = document.getElementById('pdp-main-photo');
  const mainTitle = document.getElementById('pdp-main-title');
  const label = document.querySelector('[data-pill-label]');
  const allOptions = groups.reduce(function(acc, g){ return acc.concat(Array.from(g.children)); }, []);

  function selectFlavor(name, img){
    let matchedOpt = null;
    allOptions.forEach(function(opt){
      const match = opt.dataset.flavorName === name;
      if(match) matchedOpt = opt;
      opt.classList.toggle('pill--active', match && opt.classList.contains('pill'));
      opt.classList.toggle('active', match && opt.classList.contains('pdp-thumb'));
      opt.setAttribute('aria-pressed', String(match));
    });
    if(mainPhoto && img) mainPhoto.src = withImgV(img);
    if(mainPhoto && img) mainPhoto.alt = (mainPhoto.dataset.altPrefix || '') + name;
    if(mainTitle) mainTitle.textContent = (mainTitle.dataset.titlePrefix || '') + name;
    if(label) label.textContent = name;
    applyNutrition(matchedOpt);
    /* Muestra la galería de fotos extra solo del sabor activo, y la reinicia en la primera foto */
    document.querySelectorAll('[data-photo-gallery-for]').forEach(function(g){
      const show = g.dataset.photoGalleryFor === name;
      g.hidden = !show;
      if(show){
        Array.from(g.querySelectorAll('.pdp-thumb')).forEach(function(t, i){
          t.classList.toggle('active', i === 0);
          t.setAttribute('aria-pressed', String(i === 0));
        });
      }
    });
  }

  allOptions.forEach(function(opt){
    opt.addEventListener('click', function(){
      selectFlavor(opt.dataset.flavorName, opt.dataset.flavorImg);
    });
  });

  const urlFlavor = new URLSearchParams(window.location.search).get('flavor');
  if(urlFlavor){
    const match = allOptions.find(function(opt){ return opt.dataset.flavorName === urlFlavor; });
    if(match) selectFlavor(match.dataset.flavorName, match.dataset.flavorImg);
  }
}

/* ---------- Galería de fotos extra (varias fotos del mismo sabor, sin afectar el selector de sabor) ---------- */
function initPdpPhotoGallery(){
  const containers = Array.from(document.querySelectorAll('[data-photo-gallery]'));
  if(containers.length === 0) return;
  const mainPhoto = document.getElementById('pdp-main-photo');
  containers.forEach(function(container){
    const thumbs = Array.from(container.querySelectorAll('.pdp-thumb'));
    thumbs.forEach(function(thumb){
      thumb.addEventListener('click', function(){
        thumbs.forEach(function(t){
          t.classList.toggle('active', t === thumb);
          t.setAttribute('aria-pressed', String(t === thumb));
        });
        if(mainPhoto && thumb.dataset.photoImg) mainPhoto.src = withImgV(thumb.dataset.photoImg);
      });
    });
  });
}

/* ---------- Selector de presentación (precio dinámico en la ficha de producto) ---------- */
function initPdpPresentationSelector(){
  const group = document.querySelector('[data-pill-group="presentation"]');
  if(!group) return;

  const priceEl = document.getElementById('pdp-price');
  const unitEl = document.querySelector('.pdp-price-unit');
  const options = Array.from(group.querySelectorAll('.pill'));

  function select(pill){
    const price = parseFloat(pill.dataset.price);
    if(priceEl && !isNaN(price)) priceEl.textContent = formatPrice(price);
    if(unitEl && pill.dataset.unitLabel) unitEl.textContent = pill.dataset.unitLabel;
    if(pill.dataset.packageType && window.__pdpGallerySetPackageType){
      window.__pdpGallerySetPackageType(pill.dataset.packageType);
    }
    injectPdpBsPrice();
  }

  options.forEach(function(opt){
    opt.addEventListener('click', function(){ select(opt); });
  });
}

/* ---------- Galería de producto (varias fotos por sabor, sincronizada con sabor y presentación) ---------- */
function initPdpGallery(){
  const root = document.querySelector('[data-gallery]');
  if(!root) return;

  const mainPhoto = document.getElementById('pdp-main-photo');
  const mainTitle = document.getElementById('pdp-main-title');
  const label = document.querySelector('[data-pill-label]');
  const thumbs = Array.from(root.querySelectorAll('[data-gallery-flavor]'));
  const flavorPills = Array.from(document.querySelectorAll('[data-gallery-flavor-group] [data-gallery-flavor]'));

  const activePresentationPill = document.querySelector('[data-pill-group="presentation"] .pill--active');
  const urlFlavor = new URLSearchParams(window.location.search).get('flavor');
  const urlFlavorValid = urlFlavor && thumbs.some(function(t){ return t.dataset.galleryFlavor === urlFlavor; });

  let currentFlavor = urlFlavorValid ? urlFlavor : (flavorPills.length ? flavorPills[0].dataset.galleryFlavor : (thumbs[0] && thumbs[0].dataset.galleryFlavor));
  let currentType = (activePresentationPill && activePresentationPill.dataset.packageType) || null;

  function selectThumb(thumb){
    thumbs.forEach(function(t){
      const match = t === thumb;
      t.classList.toggle('active', match);
      t.setAttribute('aria-pressed', String(match));
    });
    if(thumb.dataset.galleryType) currentType = thumb.dataset.galleryType;
    if(mainPhoto){
      mainPhoto.src = withImgV(thumb.dataset.galleryImg);
      mainPhoto.alt = thumb.getAttribute('aria-label') || mainPhoto.alt;
    }
  }

  function showFlavor(flavor){
    currentFlavor = flavor;
    let firstVisible = null;
    let matched = null;
    thumbs.forEach(function(t){
      const isFlavor = t.dataset.galleryFlavor === flavor;
      t.hidden = !isFlavor;
      if(isFlavor && !firstVisible) firstVisible = t;
      if(isFlavor && currentType && !matched && t.dataset.galleryType === currentType) matched = t;
    });
    const target = matched || firstVisible;
    if(target) selectThumb(target);
    applyNutrition(firstVisible);
    flavorPills.forEach(function(p){
      const on = p.dataset.galleryFlavor === flavor;
      p.classList.toggle('pill--active', on);
      p.setAttribute('aria-pressed', String(on));
    });
    if(label) label.textContent = flavor;
    if(mainTitle) mainTitle.textContent = (mainTitle.dataset.titlePrefix || '') + flavor;
  }

  thumbs.forEach(function(t){
    t.addEventListener('click', function(){ selectThumb(t); });
  });
  flavorPills.forEach(function(p){
    p.addEventListener('click', function(){ showFlavor(p.dataset.galleryFlavor); });
  });

  window.__pdpGallerySetPackageType = function(type){
    currentType = type;
    const match = thumbs.find(function(t){ return !t.hidden && t.dataset.galleryType === type; });
    if(match) selectThumb(match);
  };

  if(currentFlavor) showFlavor(currentFlavor);
}

/* ---------- Selectores tipo píldora (sabor, presentación, miniaturas) ---------- */
function initPillGroups(){
  document.querySelectorAll('[data-pill-group]').forEach(function(group){
    const options = Array.from(group.querySelectorAll('.pill, .pdp-thumb'));
    const label = group.parentElement && group.parentElement.querySelector('[data-pill-label]');
    options.forEach(function(opt){
      opt.addEventListener('click', function(){
        options.forEach(function(o){
          o.classList.remove('pill--active', 'active');
          o.setAttribute('aria-pressed', 'false');
        });
        opt.classList.add(opt.classList.contains('pdp-thumb') ? 'active' : 'pill--active');
        opt.setAttribute('aria-pressed', 'true');
        if(label) label.textContent = opt.textContent.trim();
      });
    });
  });
}

/* ---------- Selector de cantidad ---------- */
function initQuantitySteppers(){
  document.querySelectorAll('.qty-stepper').forEach(function(stepper){
    if(stepper.closest('.cart-line')) return;
    const output = stepper.querySelector('output');
    const decrease = stepper.querySelector('[data-qty-decrease]');
    const increase = stepper.querySelector('[data-qty-increase]');
    const min = 1;
    const max = 10;

    function getQty(){ return parseInt(output.textContent, 10) || min; }
    function setQty(value){ output.textContent = String(Math.min(max, Math.max(min, value))); }

    if(decrease) decrease.addEventListener('click', function(){ setQty(getQty() - 1); });
    if(increase) increase.addEventListener('click', function(){ setQty(getQty() + 1); });

    const addBtn = document.querySelector('[data-add-to-cart-qty]');
    if(addBtn){
      addBtn.addEventListener('click', function(){ addProductToCart(getQty()); });
    }
  });
}

/* ---------- Filtro de categoría de guías ---------- */
function initArticleFilter(){
  const filter = document.querySelector('[data-article-filter]');
  const grid = document.getElementById('article-grid');
  if(!filter || !grid) return;

  const pills = Array.from(filter.querySelectorAll('.pill'));
  const cards = Array.from(grid.querySelectorAll('.article-card'));

  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('pill--active'); p.setAttribute('aria-pressed', 'false'); });
      pill.classList.add('pill--active');
      pill.setAttribute('aria-pressed', 'true');

      const category = pill.dataset.category;
      cards.forEach(function(card){
        const match = category === 'all' || card.dataset.category === category;
        card.style.display = match ? '' : 'none';
      });
    });
  });
}

/* ---------- Índice de contenidos del artículo ---------- */
function initArticleToc(){
  const toc = document.querySelector('.article-toc');
  if(!toc || !('IntersectionObserver' in window)) return;

  const links = Array.from(toc.querySelectorAll('a'));
  const sections = links
    .map(function(link){ return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);
  if(sections.length === 0) return;

  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      const link = toc.querySelector('a[href="#' + entry.target.id + '"]');
      if(!link) return;
      if(entry.isIntersecting){
        links.forEach(function(l){ l.classList.remove('active'); });
        link.classList.add('active');
      }
    });
  }, { rootMargin: '-96px 0px -70% 0px' });

  sections.forEach(function(section){ observer.observe(section); });
}

/* ---------- Página de carrito ---------- */
function formatPrice(amount){
  return '$' + amount.toFixed(2).replace('.', ',');
}

const WHATSAPP_NUMBER = '584143695233';
const FREE_SHIPPING_AT = 30;
const SHIPPING_COST = 6;
const CARACAS_STATES = ['Distrito Capital'];
// Miranda solo cuenta como "envío estándar $6" si la zona escrita está cerca de El Hatillo.
const HATILLO_KEYWORDS = ['hatillo', 'oripoto', 'la lagunita', 'lagunita', 'la boyera', 'boyera', 'loma alta', 'los naranjos', 'la union', 'la unión', 'alto hatillo'];

function normalizeText(s){
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function isNearHatillo(zoneText){
  const t = normalizeText(zoneText);
  if(!t) return false;
  return HATILLO_KEYWORDS.some(function(kw){ return t.indexOf(normalizeText(kw)) !== -1; });
}

/* ---------- Tipo de entrega (Pickup / Delivery) ---------- */
function getDeliveryContext(){
  const activeBtn = document.querySelector('.delivery-toggle-btn.active');
  const type = activeBtn ? activeBtn.dataset.deliveryType : 'delivery';
  const stateSelect = document.getElementById('checkout-state');
  const state = stateSelect ? stateSelect.value : '';
  const zoneInput = document.getElementById('checkout-zone');
  const zoneText = zoneInput ? zoneInput.value : '';
  const isCaracas = CARACAS_STATES.indexOf(state) !== -1 || (state === 'Miranda' && isNearHatillo(zoneText));
  return { type: type, state: state, isCaracas: isCaracas, zoneText: zoneText };
}

function initDeliveryType(){
  const toggleBtns = Array.from(document.querySelectorAll('.delivery-toggle-btn'));
  if(toggleBtns.length === 0) return;

  const pickupInfo = document.getElementById('pickup-info');
  const deliveryFields = document.getElementById('delivery-fields');
  const stateSelect = document.getElementById('checkout-state');
  const caracasNote = document.getElementById('delivery-caracas-note');
  const mrwNote = document.getElementById('delivery-mrw-note');
  const zoneField = document.getElementById('checkout-zone-field');
  const zoneLabel = zoneField ? zoneField.querySelector('label') : null;
  const zoneInput = document.getElementById('checkout-zone');

  function refresh(){
    const ctx = getDeliveryContext();
    if(pickupInfo) pickupInfo.hidden = ctx.type !== 'pickup';
    if(deliveryFields) deliveryFields.hidden = ctx.type !== 'delivery';

    if(ctx.type === 'delivery'){
      const hasState = ctx.state !== '';
      const isMiranda = ctx.state === 'Miranda';
      if(caracasNote) caracasNote.hidden = !(hasState && ctx.isCaracas);
      if(mrwNote) mrwNote.hidden = !(hasState && !ctx.isCaracas);
      if(zoneField) zoneField.hidden = !hasState;
      if(zoneLabel){
        zoneLabel.textContent = (ctx.isCaracas || isMiranda) ? 'Zona de despacho' : 'Dirección de envío (MRW)';
      }
      if(zoneInput){
        zoneInput.placeholder = isMiranda ? 'Ej. El Hatillo - Oripoto' : (ctx.isCaracas ? 'Ej. Caracas - Chacao' : 'Dirección completa, punto de referencia');
      }
    }

    if(typeof window.__apexCartRerender === 'function') window.__apexCartRerender();
  }

  toggleBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      toggleBtns.forEach(function(b){
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      refresh();
    });
  });
  if(stateSelect) stateSelect.addEventListener('change', refresh);
  if(zoneInput) zoneInput.addEventListener('input', function(){
    if(getDeliveryContext().state === 'Miranda') refresh();
  });

  refresh();
}

function cartSubtotal(cart){
  return cart.reduce(function(sum, item){ return sum + item.unitPrice * item.quantity; }, 0);
}

function initCartPage(){
  const list = document.getElementById('cart-list');
  if(!list) return;

  const emptyState = document.getElementById('cart-empty');
  const layout = document.getElementById('cart-layout');
  const subtotalEl = document.getElementById('cart-subtotal');
  const shippingEl = document.getElementById('cart-shipping');
  const shippingNoteEl = document.getElementById('cart-shipping-note');
  const totalEl = document.getElementById('cart-total');

  function render(){
    const cart = getCart();

    if(cart.length === 0){
      if(layout) layout.hidden = true;
      if(emptyState) emptyState.hidden = false;
      initCartCount();
      return;
    }
    if(layout) layout.hidden = false;
    if(emptyState) emptyState.hidden = true;

    list.innerHTML = cart.map(function(item, index){
      return (
        '<div class="cart-line" data-index="' + index + '">' +
          '<div class="cart-line-media">' +
            '<img class="product-photo" src="' + escapeHtml(item.photo) + '" alt="' + escapeHtml(item.name) + '">' +
          '</div>' +
          '<div class="cart-line-info">' +
            '<p class="cart-line-brand">' + escapeHtml(item.brand) + '</p>' +
            '<p class="cart-line-name">' + escapeHtml(item.name) + '</p>' +
            '<p class="cart-line-variant">' + escapeHtml(item.variant) + '</p>' +
          '</div>' +
          '<div class="cart-line-qty">' +
            '<div class="qty-stepper" role="group" aria-label="Cantidad">' +
              '<button type="button" data-qty-decrease aria-label="Reducir cantidad">−</button>' +
              '<output>' + item.quantity + '</output>' +
              '<button type="button" data-qty-increase aria-label="Aumentar cantidad">+</button>' +
            '</div>' +
          '</div>' +
          '<p class="cart-line-price">' + formatPrice(item.unitPrice * item.quantity) + '</p>' +
          '<button type="button" class="cart-line-remove" data-cart-remove aria-label="Eliminar ' + escapeHtml(item.name) + ' del carrito">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>'
      );
    }).join('');

    Array.from(list.querySelectorAll('.cart-line')).forEach(function(line){
      const index = parseInt(line.dataset.index, 10);
      const decrease = line.querySelector('[data-qty-decrease]');
      const increase = line.querySelector('[data-qty-increase]');
      const removeBtn = line.querySelector('[data-cart-remove]');

      if(decrease) decrease.addEventListener('click', function(){
        const c = getCart();
        c[index].quantity = Math.max(1, c[index].quantity - 1);
        saveCart(c);
        render();
      });
      if(increase) increase.addEventListener('click', function(){
        const c = getCart();
        c[index].quantity = Math.min(10, c[index].quantity + 1);
        saveCart(c);
        render();
      });
      if(removeBtn) removeBtn.addEventListener('click', function(){
        const c = getCart();
        c.splice(index, 1);
        saveCart(c);
        render();
      });
    });

    const subtotal = cartSubtotal(cart);
    const deliveryCtx = getDeliveryContext();
    // shipping: número = monto fijo | null = "a coordinar" (MRW) | undefined = todavía no elige estado/zona
    let shipping;
    if(deliveryCtx.type === 'pickup'){
      shipping = 0;
    } else if(deliveryCtx.state === '' || (deliveryCtx.state === 'Miranda' && deliveryCtx.zoneText.trim() === '')){
      shipping = undefined;
    } else if(deliveryCtx.isCaracas){
      shipping = subtotal >= FREE_SHIPPING_AT ? 0 : SHIPPING_COST;
    } else {
      shipping = null; // MRW, se coordina
    }
    const pending = shipping === undefined;
    const total = subtotal + (shipping || 0);

    if(subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
    if(shippingEl) shippingEl.textContent = pending ? '—' : (shipping === null ? 'A coordinar' : (shipping === 0 ? 'Gratis' : formatPrice(shipping)));
    if(totalEl) totalEl.textContent = pending ? formatPrice(subtotal) + ' + envío' : (formatPrice(total) + (shipping === null ? ' + envío' : ''));
    if(shippingNoteEl){
      if(pending){
        shippingNoteEl.textContent = 'Selecciona tu estado para ver el costo de envío.';
        shippingNoteEl.classList.remove('ok');
      } else if(deliveryCtx.type === 'pickup'){
        shippingNoteEl.textContent = 'Retiro en tienda — sin costo de envío.';
        shippingNoteEl.classList.add('ok');
      } else if(shipping === null){
        shippingNoteEl.textContent = 'Envío por MRW: el costo se coordina por WhatsApp según tu ubicación.';
        shippingNoteEl.classList.remove('ok');
      } else if(shipping === 0){
        shippingNoteEl.textContent = 'Tu pedido califica para envío gratis.';
        shippingNoteEl.classList.add('ok');
      } else {
        shippingNoteEl.textContent = 'Añade ' + formatPrice(FREE_SHIPPING_AT - subtotal) + ' más y el envío es gratis.';
        shippingNoteEl.classList.remove('ok');
      }
    }

    const rateNoteEl = document.getElementById('bcv-rate-note');
    const subtotalBsEl = document.getElementById('cart-subtotal-bs');
    const shippingBsEl = document.getElementById('cart-shipping-bs');
    const totalBsEl = document.getElementById('cart-total-bs');
    if(bcvRate != null){
      if(rateNoteEl) rateNoteEl.textContent = 'Tasa BCV: Bs ' + formatBsNumber(1);
      if(subtotalBsEl) subtotalBsEl.textContent = 'Bs ' + formatBsNumber(subtotal);
      if(shippingBsEl) shippingBsEl.textContent = (pending || shipping === 0 || shipping === null) ? '' : 'Bs ' + formatBsNumber(shipping);
      if(totalBsEl) totalBsEl.textContent = pending ? 'Bs ' + formatBsNumber(subtotal) : 'Bs ' + formatBsNumber(total);
    } else {
      if(rateNoteEl) rateNoteEl.textContent = 'Tasa BCV no disponible por ahora.';
      if(subtotalBsEl) subtotalBsEl.textContent = '';
      if(shippingBsEl) shippingBsEl.textContent = '';
      if(totalBsEl) totalBsEl.textContent = '';
    }

    initCartCount();
  }

  window.__apexCartRerender = render;

  const couponForm = document.getElementById('coupon-form');
  const couponNote = document.getElementById('coupon-note');
  if(couponForm){
    couponForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(couponNote) couponNote.hidden = false;
    });
  }

  initDeliveryType();
  initCheckoutButton();
  render();
}

/* ---------- Botón "Continuar con el pago" -> WhatsApp ---------- */
function initCheckoutButton(){
  const btn = document.getElementById('checkout-whatsapp');
  const nameInput = document.getElementById('checkout-name');
  const zoneInput = document.getElementById('checkout-zone');
  const stateSelect = document.getElementById('checkout-state');
  const errorEl = document.getElementById('checkout-error');
  if(!btn) return;

  btn.addEventListener('click', function(){
    const cart = getCart();
    if(cart.length === 0) return;

    const deliveryCtx = getDeliveryContext();
    const customerName = nameInput ? nameInput.value.trim() : '';
    const location = zoneInput ? zoneInput.value.trim() : '';

    let missingMsg = '';
    if(!customerName) missingMsg = 'Por favor completa tu nombre.';
    else if(deliveryCtx.type === 'delivery' && !deliveryCtx.state) missingMsg = 'Por favor selecciona tu estado.';
    else if(deliveryCtx.type === 'delivery' && !location) missingMsg = deliveryCtx.isCaracas ? 'Por favor completa tu zona de despacho.' : 'Por favor completa tu dirección de envío.';

    if(missingMsg){
      if(errorEl){ errorEl.textContent = missingMsg; errorEl.hidden = false; }
      if(!customerName && nameInput) nameInput.focus();
      else if(deliveryCtx.type === 'delivery' && !deliveryCtx.state && stateSelect) stateSelect.focus();
      else if(zoneInput) zoneInput.focus();
      return;
    }
    if(errorEl) errorEl.hidden = true;

    const subtotal = cartSubtotal(cart);
    let shipping = 0;
    if(deliveryCtx.type === 'pickup') shipping = 0;
    else if(deliveryCtx.isCaracas) shipping = subtotal >= FREE_SHIPPING_AT ? 0 : SHIPPING_COST;
    else shipping = null; // MRW, a coordinar
    const total = subtotal + (shipping || 0);

    const items = cart.map(function(item){
      return { brand: item.brand, product: item.name, unitPrice: item.unitPrice, quantity: item.quantity };
    });

    const orderPayload = {
      customerName: customerName,
      location: deliveryCtx.type === 'pickup' ? 'Pickup' : location,
      deliveryType: deliveryCtx.type,
      state: deliveryCtx.state,
      total: total,
      items: items
    };

    // 1) Registrar el pedido en segundo plano — sendBeacon sigue funcionando aunque la página navegue a WhatsApp.
    try {
      navigator.sendBeacon('/.netlify/functions/submit-order', JSON.stringify(orderPayload));
    } catch(e){
      console.error('No se pudo registrar el pedido en segundo plano: ' + e);
    }

    // 2) Abrir WhatsApp de inmediato, sin esperar la respuesta del registro.
    const lines = cart.map(function(item){
      return '• ' + item.name + ' x' + item.quantity + ' — ' + formatPrice(item.unitPrice * item.quantity);
    });
    const bsSuffix = function(usd){
      const bs = formatBsNumber(usd);
      return bs ? ' (Bs ' + bs + ')' : '';
    };
    const shippingLine = deliveryCtx.type === 'pickup'
      ? 'Retiro en tienda (sin costo de envío)'
      : (shipping === null ? 'A coordinar por WhatsApp (MRW)' : (shipping === 0 ? 'Gratis' : formatPrice(shipping) + bsSuffix(shipping)));
    const deliveryLine = deliveryCtx.type === 'pickup'
      ? '\n\nTipo de entrega: Pickup\nUbicación: https://maps.app.goo.gl/TbLsaqxRNXJYe4zb9'
      : '\n\nTipo de entrega: Delivery' +
        '\nEstado: ' + deliveryCtx.state +
        '\n' + (deliveryCtx.isCaracas ? 'Zona' : 'Dirección') + ': ' + location;

    const message = 'Hola, quiero hacer este pedido:\n\n' +
      lines.join('\n') +
      '\n\nSubtotal: ' + formatPrice(subtotal) + bsSuffix(subtotal) +
      '\nEnvío: ' + shippingLine +
      '\nTotal: ' + formatPrice(total) + bsSuffix(total) + (shipping === null ? ' + envío' : '') +
      (bcvRate != null ? '\n\nTasa BCV: Bs ' + formatBsNumber(1) : '') +
      '\n\nNombre: ' + customerName +
      deliveryLine;

    const waUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
    window.location.href = waUrl;

    // Vaciar el carrito ya que el pedido quedó "enviado" hacia WhatsApp.
    saveCart([]);
  });
}

/* ---------- Carrusel del héroe ---------- */
function initHeroCarousel(){
  const root = document.querySelector('.hero-carousel');
  if(!root) return;

  const slides = Array.from(root.querySelectorAll('.hero-slide'));
  const dotsWrap = root.querySelector('.carousel-dots');
  const prevBtn = root.querySelector('.carousel-arrow--prev');
  const nextBtn = root.querySelector('.carousel-arrow--next');
  const AUTOPLAY_MS = 6000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = slides.findIndex(function(s){ return s.classList.contains('active'); });
  if(index < 0) index = 0;
  let timer = null;

  function render(){
    slides.forEach(function(s, i){ s.classList.toggle('active', i === index); });
    if(dotsWrap){
      Array.from(dotsWrap.children).forEach(function(d, i){ d.classList.toggle('active', i === index); });
    }
  }

  function go(i){
    index = (i + slides.length) % slides.length;
    render();
  }

  function stopAutoplay(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  function startAutoplay(){
    if(reduceMotion || slides.length < 2) return;
    stopAutoplay();
    timer = setInterval(function(){ go(index + 1); }, AUTOPLAY_MS);
  }

  function goManual(i){
    go(i);
    startAutoplay();
  }

  if(dotsWrap){
    slides.forEach(function(_, i){
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', 'Ir a la diapositiva ' + (i + 1));
      dot.addEventListener('click', function(){ goManual(i); });
      dotsWrap.appendChild(dot);
    });
  }
  if(prevBtn) prevBtn.addEventListener('click', function(){ goManual(index - 1); });
  if(nextBtn) nextBtn.addEventListener('click', function(){ goManual(index + 1); });

  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);
  root.addEventListener('focusin', stopAutoplay);
  root.addEventListener('focusout', startAutoplay);
  document.addEventListener('visibilitychange', function(){
    if(document.hidden) stopAutoplay(); else startAutoplay();
  });

  render();
  startAutoplay();
}

document.addEventListener('DOMContentLoaded', function(){
  initImageCacheBust();
  initCartCount();
  initMegaMenu();
  initMobileMenu();
  initNewsletterForms();
  initAddToCartButtons();
  initCardAddToCartButtons();
  initFiltersToggle();
  initCategoryFilters();
  initPillGroups();
  initPdpFlavorSelector();
  initPdpGallery();
  initPdpPhotoGallery();
  initPdpPresentationSelector();
  initQuantitySteppers();
  initArticleFilter();
  initArticleToc();
  initCartPage();
  initHeroCarousel();

  fetchBcvRate().then(function(){
    injectProductCardBsPrices();
    injectPdpBsPrice();
    if(typeof window.__apexCartRerender === 'function') window.__apexCartRerender();
  });
});
