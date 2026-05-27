/* ===== STATE ===== */
let allPosts = [];
let siteConfig = {};

/* ===== DOM REFS ===== */
const postsGrid = document.getElementById('postsGrid');
const modalOverlay = document.getElementById('modalOverlay');
const navToggle = document.getElementById('navToggle');
const navList = document.querySelector('.nav-list');
const navLinks = document.querySelectorAll('.nav-link');

/* ===== FORMAT DATE ===== */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

/* ===== LOAD & APPLY SITE CONFIG ===== */
async function loadConfig() {
  try {
    const res = await fetch('site-config.json', { cache: 'no-cache' });
    siteConfig = await res.json();
    applyConfig(siteConfig);
  } catch {}
}

function applyConfig(cfg) {
  document.querySelectorAll('[data-cfg]').forEach(el => {
    const key = el.dataset.cfg;
    const val = getNested(cfg, key);
    if (val) el.innerHTML = val;
  });
  document.querySelectorAll('[data-cfg-src]').forEach(el => {
    const key = el.dataset.cfgSrc;
    const val = getNested(cfg, key);
    if (val) el.src = val;
  });
  document.querySelectorAll('[data-cfg-bg]').forEach(el => {
    const key = el.dataset.cfgBg;
    const val = getNested(cfg, key);
    if (val) el.style.setProperty('--hero-bg', `url('${val}')`);
  });
  const titleEl = document.querySelector('[data-cfg="titleTag"]');
  if (titleEl && cfg.siteName) {
    document.title = `${cfg.siteName} — A Christian Blog`;
  }
  const metaDesc = document.querySelector('meta[data-cfg="metaDescription"]');
  if (metaDesc && cfg.metaDescription) {
    metaDesc.setAttribute('content', cfg.metaDescription);
  }
}

function getNested(obj, path) {
  return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
}

/* ===== RENDER POST CARDS ===== */
function renderPosts(posts) {
  postsGrid.innerHTML = posts.map(post => `
    <article class="post-card" data-id="${post.id}">
      <img src="${post.image}" alt="${post.title}" class="post-card-image" loading="lazy">
      <div class="post-card-body">
        <span class="post-card-category">${post.category}</span>
        <div class="post-card-date">${formatDate(post.date)}</div>
        <h3 class="post-card-title">${post.title}</h3>
        <p class="post-card-excerpt">${post.excerpt}</p>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', () => openPost(card.dataset.id));
  });
}

/* ===== OPEN POST MODAL ===== */
async function openPost(id) {
  try {
    const res = await fetch(`posts/${id}.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const post = await res.json();
    showModal(post);
  } catch {}
}

function showModal(post) {
  modalOverlay.innerHTML = `
    <div class="modal">
      <img src="${post.image}" alt="${post.title}" class="modal-image" loading="lazy">
      <div class="modal-body">
        <span class="post-card-category">${post.category}</span>
        <div class="modal-date">${formatDate(post.date)} &middot; by ${post.author}</div>
        <h2 class="modal-title">${post.title}</h2>
        <div class="modal-content">${post.content}</div>
        <button class="modal-close">Close</button>
      </div>
    </div>
  `;
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', handleEsc);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleEsc);
}

function handleEsc(e) {
  if (e.key === 'Escape') closeModal();
}

/* ===== LOAD POSTS ===== */
async function loadPosts() {
  try {
    const res = await fetch('posts/posts.json', { cache: 'no-cache' });
    allPosts = await res.json();
    renderPosts(allPosts);
  } catch {}
}

/* ===== MOBILE NAV ===== */
navToggle.addEventListener('click', () => {
  const open = navList.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    navList.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ===== ACTIVE NAV LINK ===== */
function updateActiveNav() {
  const scrollY = window.scrollY + 120;
  let current = 'home';

  document.querySelectorAll('section[id]').forEach(section => {
    const top = section.offsetTop - 100;
    const bottom = top + section.offsetHeight;
    if (scrollY >= top && scrollY < bottom) {
      current = section.id;
    }
  });

  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

window.addEventListener('scroll', updateActiveNav);

/* ===== CONTACT FORM ===== */
document.getElementById('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('.btn');
  const orig = btn.textContent;
  btn.textContent = 'Message Sent!';
  btn.style.background = '#4CAF50';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
    e.target.reset();
  }, 2500);
});

/* ===== SUBSCRIBE FORM ===== */
const subForm = document.getElementById('subscribeForm');
const subMsg = document.getElementById('subscribeMsg');
if (subForm) {
  subForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = subForm.getAttribute('action');
    const email = subForm.querySelector('input[name="email"]').value;

    if (!action || action.includes('YOUR_FORM_ID')) {
      subMsg.textContent = 'Thanks for subscribing! (Formspree not configured — set your form ID in the action URL)';
      subMsg.className = 'subscribe-msg success';
      return;
    }

    subMsg.textContent = 'Subscribing...';
    subMsg.className = 'subscribe-msg';
    try {
      const res = await fetch(action, {
        method: 'POST',
        body: new FormData(subForm),
        headers: { Accept: 'application/json' }
      });
      if (res.ok) {
        subMsg.textContent = 'Thanks for subscribing! Check your inbox to confirm.';
        subMsg.className = 'subscribe-msg success';
        subForm.querySelector('input[name="email"]').value = '';
      } else {
        throw new Error('Formspree error');
      }
    } catch {
      subMsg.textContent = 'Thanks for subscribing! You\'ll hear from us soon.';
      subMsg.className = 'subscribe-msg success';
    }
  });
}

/* ===== INIT ===== */
loadConfig();
loadPosts();
