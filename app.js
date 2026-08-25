'use strict';

/* Estado en memoria — sin localStorage/sessionStorage */
const store = {
  cartCount: 3
};

function initCartCount(){
  document.querySelectorAll('[data-cart-count]').forEach(function(el){
    el.textContent = store.cartCount;
  });
}

function addToCart(amount){
  store.cartCount += amount || 1;
  initCartCount();
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

/* ---------- Botones "Agregar al carrito" de demostración ---------- */
function initAddToCartButtons(){
  document.querySelectorAll('[data-add-to-cart]').forEach(function(btn){
    btn.addEventListener('click', function(){
      addToCart(1);
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
    subtitle: 'Electrolitos en polvo, cápsulas y masticables para reponer lo que pierdes por el sudor.',
  },
  carbohidratos: {
    title: 'Carbohidratos',
    subtitle: 'Geles, gomitas, waffles y barras para sostener el ritmo antes, durante y después del entrenamiento. Filtra por cafeína, carbohidratos y sodio por porción para comparar de verdad.',
  },
  proteina: {
    title: 'Proteína',
    subtitle: 'Polvos y barras para la ventana de recuperación después de entrenar.',
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
    if(mainPhoto && img) mainPhoto.src = img;
    if(mainPhoto && img) mainPhoto.alt = (mainPhoto.dataset.altPrefix || '') + name;
    if(mainTitle) mainTitle.textContent = (mainTitle.dataset.titlePrefix || '') + name;
    if(label) label.textContent = name;
    applyNutrition(matchedOpt);
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
      mainPhoto.src = thumb.dataset.galleryImg;
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
      addBtn.addEventListener('click', function(){ addToCart(getQty()); });
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

function initCartPage(){
  const list = document.getElementById('cart-list');
  if(!list) return;

  const lines = Array.from(list.querySelectorAll('.cart-line'));
  const emptyState = document.getElementById('cart-empty');
  const layout = document.getElementById('cart-layout');
  const subtotalEl = document.getElementById('cart-subtotal');
  const shippingEl = document.getElementById('cart-shipping');
  const shippingNoteEl = document.getElementById('cart-shipping-note');
  const totalEl = document.getElementById('cart-total');
  const FREE_SHIPPING_AT = 30;
  const SHIPPING_COST = 4;

  function recalculate(){
    let subtotal = 0;
    let totalQty = 0;
    let visibleLines = 0;

    lines.forEach(function(line){
      if(line.dataset.removed === 'true') return;
      visibleLines++;
      const price = parseFloat(line.dataset.price);
      const qty = parseInt(line.querySelector('output').textContent, 10) || 1;
      const lineTotal = price * qty;
      line.querySelector('.cart-line-price').textContent = formatPrice(lineTotal);
      subtotal += lineTotal;
      totalQty += qty;
    });

    if(visibleLines === 0){
      if(layout) layout.hidden = true;
      if(emptyState) emptyState.hidden = false;
      store.cartCount = 0;
      initCartCount();
      return;
    }
    if(layout) layout.hidden = false;
    if(emptyState) emptyState.hidden = true;

    const shipping = subtotal >= FREE_SHIPPING_AT ? 0 : SHIPPING_COST;
    const total = subtotal + shipping;

    if(subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
    if(shippingEl) shippingEl.textContent = shipping === 0 ? 'Gratis' : formatPrice(shipping);
    if(totalEl) totalEl.textContent = formatPrice(total);
    if(shippingNoteEl){
      if(shipping === 0){
        shippingNoteEl.textContent = 'Tu pedido califica para envío gratis.';
        shippingNoteEl.classList.add('ok');
      } else {
        shippingNoteEl.textContent = 'Añade ' + formatPrice(FREE_SHIPPING_AT - subtotal) + ' más y el envío es gratis.';
        shippingNoteEl.classList.remove('ok');
      }
    }

    store.cartCount = totalQty;
    initCartCount();
  }

  lines.forEach(function(line){
    const decrease = line.querySelector('[data-qty-decrease]');
    const increase = line.querySelector('[data-qty-increase]');
    const output = line.querySelector('output');
    const removeBtn = line.querySelector('[data-cart-remove]');

    if(decrease) decrease.addEventListener('click', function(){
      const qty = Math.max(1, (parseInt(output.textContent, 10) || 1) - 1);
      output.textContent = String(qty);
      recalculate();
    });
    if(increase) increase.addEventListener('click', function(){
      const qty = Math.min(10, (parseInt(output.textContent, 10) || 1) + 1);
      output.textContent = String(qty);
      recalculate();
    });
    if(removeBtn) removeBtn.addEventListener('click', function(){
      line.dataset.removed = 'true';
      line.style.display = 'none';
      recalculate();
    });
  });

  const couponForm = document.getElementById('coupon-form');
  const couponNote = document.getElementById('coupon-note');
  if(couponForm){
    couponForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(couponNote) couponNote.hidden = false;
    });
  }

  recalculate();
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
  initCartCount();
  initMegaMenu();
  initMobileMenu();
  initNewsletterForms();
  initAddToCartButtons();
  initFiltersToggle();
  initCategoryFilters();
  initPillGroups();
  initPdpFlavorSelector();
  initPdpGallery();
  initPdpPresentationSelector();
  initQuantitySteppers();
  initArticleFilter();
  initArticleToc();
  initCartPage();
  initHeroCarousel();
});
