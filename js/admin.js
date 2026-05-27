/* ===== FALLBACK PASSWORD HASH ===== */
const FALLBACK_HASH = 'b9bdfb380fbfe39c592804dee2ef71d3e949d10d34b8e3267729616d02108efd';

/* ===== STATE ===== */
let token = '';
let owner = '';
let repo = '';
let allPosts = [];
let editingId = null;
let storedHash = '';
let totpVerified = false;
let tempSecret = '';
let tempRecoveryPlain = [];

/* ===== DOM REFS — VIEWS ===== */
const viewLogin = document.getElementById('viewLogin');
const viewDashboard = document.getElementById('viewDashboard');
const viewEditor = document.getElementById('viewEditor');

/* ===== DOM REFS — LOGIN ===== */
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginStep2 = document.getElementById('loginStep2');
const loginTotpStep = document.getElementById('loginTotpStep');
const loginRecoveryStep = document.getElementById('loginRecoveryStep');
const loginTotp = document.getElementById('loginTotp');
const loginTotpBtn = document.getElementById('loginTotpBtn');
const loginTotpError = document.getElementById('loginTotpError');
const loginUseRecovery = document.getElementById('loginUseRecovery');
const loginBackToTotp = document.getElementById('loginBackToTotp');
const loginRecoveryCode = document.getElementById('loginRecoveryCode');
const loginRecoveryBtn = document.getElementById('loginRecoveryBtn');
const loginRecoveryError = document.getElementById('loginRecoveryError');

/* ===== DOM REFS — DASHBOARD ===== */
const postsBody = document.getElementById('postsBody');
const postsTable = document.getElementById('postsTable');
const emptyState = document.getElementById('emptyState');
const dashLoading = document.getElementById('dashLoading');
const newPostBtn = document.getElementById('newPostBtn');
const logoutBtn = document.getElementById('logoutBtn');

/* ===== DOM REFS — EDITOR ===== */
const editorBackBtn = document.getElementById('editorBackBtn');
const editorForm = document.getElementById('editorForm');
const editorTitle = document.getElementById('editorTitle');
const edSaveBtn = document.getElementById('edSaveBtn');
const edMsg = document.getElementById('edMsg');
const edTitle = document.getElementById('edTitle');
const edSlug = document.getElementById('edSlug');
const edCategory = document.getElementById('edCategory');
const edAuthor = document.getElementById('edAuthor');
const edDate = document.getElementById('edDate');
const edImage = document.getElementById('edImage');
const edExcerpt = document.getElementById('edExcerpt');
const edContent = document.getElementById('edContent');

/* ===== DOM REFS — SETTINGS ===== */
const settingsForm = document.getElementById('settingsForm');
const settingsMsg = document.getElementById('settingsMsg');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');

/* ===== DOM REFS — ACCOUNT ===== */
const passwordForm = document.getElementById('passwordForm');
const pwMsg = document.getElementById('pwMsg');
const pwSaveBtn = document.getElementById('pwSaveBtn');
const mfaStatusLabel = document.getElementById('mfaStatusLabel');
const mfaEnableBtn = document.getElementById('mfaEnableBtn');
const mfaSetup = document.getElementById('mfaSetup');
const mfaQr = document.getElementById('mfaQr');
const mfaSecretText = document.getElementById('mfaSecretText');
const mfaVerifyCode = document.getElementById('mfaVerifyCode');
const mfaVerifyBtn = document.getElementById('mfaVerifyBtn');
const mfaCancelBtn = document.getElementById('mfaCancelBtn');
const mfaSetupMsg = document.getElementById('mfaSetupMsg');
const mfaRecoveryWrap = document.getElementById('mfaRecoveryWrap');
const mfaRecoveryList = document.getElementById('mfaRecoveryList');
const mfaRecoveryDoneBtn = document.getElementById('mfaRecoveryDoneBtn');
const mfaControls = document.getElementById('mfaControls');
const mfaShowRecoveryBtn = document.getElementById('mfaShowRecoveryBtn');
const mfaRegenBtn = document.getElementById('mfaRegenBtn');
const mfaDisableBtn = document.getElementById('mfaDisableBtn');
const mfaControlMsg = document.getElementById('mfaControlMsg');

/* ===== SHA-256 ===== */
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ===== GITHUB API HELPERS ===== */
async function ghFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${path}`, opts);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error: ${res.status}`);
  }
  return res.json();
}

async function getFileSha(path) {
  const data = await ghFetch(`contents/${path}`);
  return data ? data.sha : null;
}

async function readFileContent(path) {
  const data = await ghFetch(`contents/${path}`);
  if (!data) return null;
  return { content: atob(data.content.replace(/\n/g, '')), sha: data.sha };
}

async function writeFile(path, content, sha = null) {
  const body = { message: `Update ${path}`, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  return ghFetch(`contents/${path}`, 'PUT', body);
}

async function deleteFile(path, sha) {
  return ghFetch(`contents/${path}`, 'DELETE', { message: `Delete ${path}`, sha });
}

/* ===== BASE32 ===== */
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = 0, bitCount = 0, result = '';
  for (const b of bytes) {
    bits = (bits << 8) | b;
    bitCount += 8;
    while (bitCount >= 5) {
      result += BASE32_CHARS[(bits >> (bitCount - 5)) & 0x1f];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) result += BASE32_CHARS[(bits << (5 - bitCount)) & 0x1f];
  return result;
}

function base32Decode(str) {
  const bytes = [];
  let bits = 0, bitCount = 0;
  for (const ch of str.toUpperCase()) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) continue;
    bits = (bits << 5) | idx;
    bitCount += 5;
    if (bitCount >= 8) {
      bytes.push((bits >> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/* ===== TOTP ===== */
function generateTOTPSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function generateTOTP(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter), false);

  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

async function verifyTOTP(secret, code) {
  const now = Date.now();
  for (let i = -1; i <= 1; i++) {
    if (await generateTOTP(secret, now + i * 30000) === code) return true;
  }
  return false;
}

function generateTOTPUri(secret, label) {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(label)}`;
}

/* ===== RECOVERY CODES ===== */
function generatePlainCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
    codes.push(code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8));
  }
  return codes;
}

async function hashCodes(plainCodes) {
  const hashes = [];
  for (const code of plainCodes) hashes.push(await sha256(code));
  return hashes;
}

/* ===== LOGIN ===== */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  token = document.getElementById('loginToken').value.trim();
  owner = document.getElementById('loginOwner').value.trim();
  repo = document.getElementById('loginRepo').value.trim();
  if (!token || !owner || !repo) {
    loginError.textContent = 'Please fill in all fields.';
    return;
  }

  loginError.textContent = 'Verifying...';
  totpVerified = false;

  try {
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    storedHash = cfg.passwordHash || FALLBACK_HASH;

    const pw = document.getElementById('loginPassword').value;
    if ((await sha256(pw)) !== storedHash) {
      loginError.textContent = 'Incorrect password.';
      return;
    }

    if (cfg.totpEnabled && cfg.totpSecret) {
      window._totpSecret = cfg.totpSecret;
      window._recoveryHashes = cfg.recoveryCodeHashes || [];
      loginForm.style.display = 'none';
      loginStep2.style.display = '';
      loginTotpStep.style.display = '';
      loginRecoveryStep.style.display = 'none';
      loginTotpError.textContent = '';
      loginRecoveryError.textContent = '';
      loginTotp.value = '';
      loginTotp.focus();
    } else {
      totpVerified = true;
      localStorage.setItem('adminToken', token);
      localStorage.setItem('adminOwner', owner);
      localStorage.setItem('adminRepo', repo);
      showDashboard();
    }
  } catch (err) {
    loginError.textContent = 'Connection error: ' + err.message;
  }
});

/* ===== LOGIN STEP 2: TOTP ===== */
loginTotpBtn.addEventListener('click', async () => {
  const code = loginTotp.value.trim();
  if (!/^\d{6}$/.test(code)) {
    loginTotpError.textContent = 'Enter a valid 6-digit code.';
    return;
  }
  loginTotpError.textContent = 'Verifying...';
  try {
    if (await verifyTOTP(window._totpSecret, code)) {
      totpVerified = true;
      localStorage.setItem('adminToken', token);
      localStorage.setItem('adminOwner', owner);
      localStorage.setItem('adminRepo', repo);
      showDashboard();
    } else {
      loginTotpError.textContent = 'Invalid code. Try again.';
    }
  } catch {
    loginTotpError.textContent = 'Verification failed.';
  }
});

loginTotp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginTotpBtn.click();
});

loginUseRecovery.addEventListener('click', (e) => {
  e.preventDefault();
  loginTotpStep.style.display = 'none';
  loginRecoveryStep.style.display = '';
  loginRecoveryCode.focus();
});

loginBackToTotp.addEventListener('click', (e) => {
  e.preventDefault();
  loginRecoveryStep.style.display = 'none';
  loginTotpStep.style.display = '';
  loginTotp.focus();
});

loginRecoveryBtn.addEventListener('click', async () => {
  const code = loginRecoveryCode.value.trim();
  if (!code) {
    loginRecoveryError.textContent = 'Enter a recovery code.';
    return;
  }
  loginRecoveryError.textContent = 'Verifying...';
  const hash = await sha256(code);
  const idx = window._recoveryHashes.indexOf(hash);
  if (idx === -1) {
    loginRecoveryError.textContent = 'Invalid recovery code.';
    return;
  }
  window._recoveryHashes.splice(idx, 1);
  try {
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    cfg.recoveryCodeHashes = window._recoveryHashes;
    await writeFile('admin-config.json', JSON.stringify(cfg, null, 2), data ? data.sha : null);
    totpVerified = true;
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminOwner', owner);
    localStorage.setItem('adminRepo', repo);
    showDashboard();
  } catch (err) {
    loginRecoveryError.textContent = 'Failed to consume recovery code: ' + err.message;
  }
});

loginRecoveryCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginRecoveryBtn.click();
});

/* ===== VIEWS ===== */
function showView(view) {
  [viewLogin, viewDashboard, viewEditor].forEach(v => v.style.display = 'none');
  view.style.display = '';
}

function showDashboard() {
  loginForm.style.display = '';
  loginStep2.style.display = 'none';
  showView(viewDashboard);
  switchTab('posts');
}

function showEditor(post = null) {
  showView(viewEditor);
  editingId = post ? post.id : null;
  editorTitle.textContent = post ? 'Edit Post' : 'New Post';
  edSaveBtn.textContent = post ? 'Update Post' : 'Publish Post';
  edMsg.textContent = '';
  edMsg.className = 'form-msg';
  if (post) {
    edTitle.value = post.title; edSlug.value = post.id;
    edCategory.value = post.category; edAuthor.value = post.author;
    edDate.value = post.date; edImage.value = post.image || '';
    edExcerpt.value = post.excerpt; edContent.value = post.content;
  } else {
    editorForm.reset(); edSlug.value = '';
    edDate.value = new Date().toISOString().slice(0, 10);
    edAuthor.value = 'Ministry Team';
  }
}

/* ===== TABS ===== */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  const content = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (content) content.style.display = '';
  if (tabId === 'posts') loadDashboardPosts();
  if (tabId === 'settings') loadSettings();
  if (tabId === 'account') loadMfaStatus();
}

/* ===== GENERATE SLUG ===== */
edTitle.addEventListener('input', () => {
  if (editingId) return;
  edSlug.value = edTitle.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
});

/* ===== DASHBOARD ===== */
async function loadDashboardPosts() {
  dashLoading.style.display = '';
  postsTable.style.display = 'none';
  emptyState.style.display = 'none';
  try {
    const data = await readFileContent('posts/posts.json');
    allPosts = data ? JSON.parse(data.content) : [];
  } catch { allPosts = []; }
  renderDashboardPosts();
}

function renderDashboardPosts() {
  dashLoading.style.display = 'none';
  if (!allPosts.length) { emptyState.style.display = ''; postsTable.style.display = 'none'; return; }
  postsTable.style.display = ''; emptyState.style.display = 'none';
  postsBody.innerHTML = allPosts.map(p => `
    <tr data-post-id="${p.id}">
      <td class="post-title">${escHtml(p.title)}</td>
      <td><span class="post-category">${escHtml(p.category)}</span></td>
      <td>${p.date}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm act-edit">Edit</button>
        <button class="btn btn-danger btn-sm act-delete">Delete</button>
      </td>
    </tr>
  `).join('');
}

postsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('tr[data-post-id]');
  if (!row) return;
  const id = row.dataset.postId;
  if (btn.classList.contains('act-edit')) editPost(id);
  else if (btn.classList.contains('act-delete')) deletePost(id);
});

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

newPostBtn.addEventListener('click', () => showEditor(null));
editorBackBtn.addEventListener('click', showDashboard);
document.getElementById('edCancelBtn').addEventListener('click', showDashboard);

async function editPost(id) {
  const meta = allPosts.find(p => p.id === id);
  if (!meta) { alert('Post not found.'); return; }
  try {
    const data = await readFileContent(`posts/${id}.json`);
    if (data) {
      const full = JSON.parse(data.content);
      showEditor(full);
    } else {
      showEditor(meta);
    }
  } catch {
    showEditor(meta);
  }
}

async function deletePost(id) {
  if (!confirm(`Delete "${id}"?`)) return;
  try {
    const sha = await getFileSha(`posts/${id}.json`);
    if (sha) await deleteFile(`posts/${id}.json`, sha);
    const updated = allPosts.filter(p => p.id !== id);
    const content = JSON.stringify(updated, null, 2);
    const data = await readFileContent('posts/posts.json');
    await writeFile('posts/posts.json', content, data ? data.sha : null);
    allPosts = updated; renderDashboardPosts();
  } catch (err) { alert('Delete failed: ' + err.message); }
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminOwner');
  localStorage.removeItem('adminRepo');
  showView(viewLogin);
});

/* ===== SAVE POST ===== */
editorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  edMsg.textContent = 'Saving...'; edMsg.className = 'form-msg';
  edSaveBtn.disabled = true;

  const title = edTitle.value.trim(), slug = edSlug.value.trim();
  const category = edCategory.value.trim(), author = edAuthor.value.trim();
  const date = edDate.value;
  const image = edImage.value.trim() || 'https://images.unsplash.com/photo-1504052434564-5ac4fc2b6cb0?w=800&q=80';
  const excerpt = edExcerpt.value.trim(), content = edContent.value.trim();

  if (!slug.match(/^[a-z0-9-]+$/)) {
    edMsg.textContent = 'Slug must contain only lowercase letters, numbers, and hyphens.';
    edMsg.className = 'form-msg error'; edSaveBtn.disabled = false; return;
  }

  const post = { id: slug, title, date, author, excerpt, content, category, image };

  try {
    const postsData = await readFileContent('posts/posts.json');
    let posts = postsData ? JSON.parse(postsData.content) : [];
    const idx = posts.findIndex(p => p.id === slug);
    if (editingId && editingId !== slug) {
      const oldSha = await getFileSha(`posts/${editingId}.json`);
      if (oldSha) await deleteFile(`posts/${editingId}.json`, oldSha);
    }
    const postContent = JSON.stringify(post, null, 2);
    const postSha = editingId && editingId === slug ? await getFileSha(`posts/${slug}.json`) : null;
    await writeFile(`posts/${slug}.json`, postContent, postSha);
    const meta = { id: slug, title, date, author, excerpt, category, image };
    if (idx >= 0) posts[idx] = meta; else posts.push(meta);
    await writeFile('posts/posts.json', JSON.stringify(posts, null, 2), postsData ? postsData.sha : null);
    edMsg.textContent = 'Post published! Redirecting...'; edMsg.className = 'form-msg success';
    setTimeout(showDashboard, 800);
  } catch (err) {
    edMsg.textContent = 'Error: ' + err.message; edMsg.className = 'form-msg error';
    edSaveBtn.disabled = false;
  }
});

/* ===== SETTINGS EDITOR ===== */
const SETTINGS_PATH = 'site-config.json';
const SETTINGS_FIELDS = [
  'siteName', 'metaDescription',
  'hero-title', 'hero-subtitle', 'hero-bgImage',
  'about-title', 'about-paragraph1', 'about-paragraph2', 'about-verse', 'about-image',
  'subscribe-title', 'subscribe-subtitle', 'subscribe-successMsg',
  'footer-tagline'
];

async function loadSettings() {
  settingsMsg.textContent = 'Loading...'; settingsMsg.className = 'form-msg';
  try {
    const data = await readFileContent(SETTINGS_PATH);
    if (!data) throw new Error('site-config.json not found');
    const cfg = JSON.parse(data.content);
    SETTINGS_FIELDS.forEach(key => {
      const el = document.getElementById(`cfg-${key}`);
      if (el) { const val = key.split('-').reduce((o, p) => (o ? o[p] : undefined), cfg); el.value = val || ''; }
    });
    settingsMsg.textContent = ''; settingsMsg.className = 'form-msg';
  } catch (err) {
    settingsMsg.textContent = 'Error loading settings: ' + err.message;
    settingsMsg.className = 'form-msg error';
  }
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  settingsMsg.textContent = 'Saving...'; settingsMsg.className = 'form-msg';
  settingsSaveBtn.disabled = true;
  const cfg = {};
  SETTINGS_FIELDS.forEach(key => {
    const el = document.getElementById(`cfg-${key}`);
    if (!el) return;
    const parts = key.split('-'); let current = cfg;
    for (let i = 0; i < parts.length - 1; i++) { if (!current[parts[i]]) current[parts[i]] = {}; current = current[parts[i]]; }
    current[parts[parts.length - 1]] = el.value;
  });
  cfg.siteName = cfg.siteName || 'Faith & Fellowship';
  try {
    const data = await readFileContent(SETTINGS_PATH);
    await writeFile(SETTINGS_PATH, JSON.stringify(cfg, null, 2), data ? data.sha : null);
    settingsMsg.textContent = 'Settings saved!'; settingsMsg.className = 'form-msg success';
  } catch (err) {
    settingsMsg.textContent = 'Error: ' + err.message; settingsMsg.className = 'form-msg error';
  }
  settingsSaveBtn.disabled = false;
});

/* ===== CHANGE PASSWORD ===== */
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  pwMsg.textContent = ''; pwMsg.className = 'form-msg';
  pwSaveBtn.disabled = true;

  const current = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;

  if ((await sha256(current)) !== storedHash) {
    pwMsg.textContent = 'Current password is incorrect.'; pwMsg.className = 'form-msg error';
    pwSaveBtn.disabled = false; return;
  }
  if (newPw.length < 4) {
    pwMsg.textContent = 'New password must be at least 4 characters.'; pwMsg.className = 'form-msg error';
    pwSaveBtn.disabled = false; return;
  }
  if (newPw !== confirm) {
    pwMsg.textContent = 'New passwords do not match.'; pwMsg.className = 'form-msg error';
    pwSaveBtn.disabled = false; return;
  }

  try {
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    cfg.passwordHash = await sha256(newPw);
    await writeFile('admin-config.json', JSON.stringify(cfg, null, 2), data ? data.sha : null);
    storedHash = cfg.passwordHash;
    pwMsg.textContent = 'Password updated!'; pwMsg.className = 'form-msg success';
    passwordForm.reset();
  } catch (err) {
    pwMsg.textContent = 'Error: ' + err.message; pwMsg.className = 'form-msg error';
  }
  pwSaveBtn.disabled = false;
});

/* ===== MFA ===== */
let mfaConfig = {};

async function loadMfaStatus() {
  try {
    const data = await readFileContent('admin-config.json');
    mfaConfig = data ? JSON.parse(data.content) : {};
  } catch { mfaConfig = {}; }

  const enabled = mfaConfig.totpEnabled && mfaConfig.totpSecret;
  mfaStatusLabel.innerHTML = `Status: ${enabled ? '<span class="mfa-enabled">Enabled</span>' : '<span class="mfa-disabled">Disabled</span>'}`;
  mfaSetup.style.display = 'none';
  mfaRecoveryWrap.style.display = 'none';
  mfaControls.style.display = enabled ? '' : 'none';
  mfaEnableBtn.style.display = enabled ? 'none' : '';
}

/* Enable MFA */
mfaEnableBtn.addEventListener('click', () => {
  tempSecret = generateTOTPSecret();
  mfaSetup.style.display = '';
  mfaEnableBtn.style.display = 'none';
  mfaRecoveryWrap.style.display = 'none';
  mfaControls.style.display = 'none';
  mfaSetupMsg.textContent = ''; mfaSetupMsg.className = 'form-msg';

  mfaQr.innerHTML = '';
  mfaSecretText.textContent = tempSecret;

  try {
    const uri = generateTOTPUri(tempSecret, document.querySelector('.logo')?.textContent || 'Faith & Fellowship');
    new QRCode(mfaQr, { text: uri, width: 180, height: 180, colorDark: '#1E3D63', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.H });
  } catch {
    mfaQr.innerHTML = '<p style="color:var(--clr-text-light);font-size:0.85rem">Could not render QR. Use the secret key below.</p>';
  }
});

mfaCancelBtn.addEventListener('click', () => {
  mfaSetup.style.display = 'none';
  mfaEnableBtn.style.display = '';
  tempSecret = '';
});

mfaVerifyBtn.addEventListener('click', async () => {
  const code = mfaVerifyCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    mfaSetupMsg.textContent = 'Enter a valid 6-digit code.'; mfaSetupMsg.className = 'form-msg error';
    return;
  }
  mfaSetupMsg.textContent = 'Verifying...'; mfaSetupMsg.className = 'form-msg';

  try {
    if (!(await verifyTOTP(tempSecret, code))) {
      mfaSetupMsg.textContent = 'Invalid code. Make sure your authenticator app is set up correctly.'; mfaSetupMsg.className = 'form-msg error';
      return;
    }

    const codes = generatePlainCodes(8);
    tempRecoveryPlain = codes;

    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    cfg.totpSecret = tempSecret;
    cfg.totpEnabled = true;
    cfg.recoveryCodeHashes = await hashCodes(codes);
    await writeFile('admin-config.json', JSON.stringify(cfg, null, 2), data ? data.sha : null);
    mfaConfig = cfg;

    mfaSetup.style.display = 'none';

    mfaRecoveryList.innerHTML = codes.map(c => `<code class="rcode">${c}</code>`).join('');
    mfaRecoveryWrap.style.display = '';
    mfaControls.style.display = 'none';

    mfaStatusLabel.innerHTML = 'Status: <span class="mfa-enabled">Enabled</span>';
  } catch (err) {
    mfaSetupMsg.textContent = 'Error: ' + err.message; mfaSetupMsg.className = 'form-msg error';
  }
});

mfaRecoveryDoneBtn.addEventListener('click', () => {
  mfaRecoveryWrap.style.display = 'none';
  mfaControls.style.display = '';
  mfaEnableBtn.style.display = 'none';
  mfaVerifyCode.value = '';
});

/* Show recovery codes (from config) */
mfaShowRecoveryBtn.addEventListener('click', async () => {
  const label = prompt('Enter your admin password to view recovery codes:');
  if (!label) return;
  if ((await sha256(label)) !== storedHash) { alert('Incorrect password.'); return; }
  try {
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    const hashes = cfg.recoveryCodeHashes || [];
    if (!hashes.length) { alert('No recovery codes remaining. Generate new ones.'); return; }
    alert(`You have ${hashes.length} recovery code(s) remaining.\n\nCodes cannot be retrieved for security — generate new ones if needed.`);
  } catch { alert('Could not load recovery codes.'); }
});

/* Regenerate recovery codes */
mfaRegenBtn.addEventListener('click', async () => {
  if (!confirm('Generate new recovery codes? Previous codes will stop working.')) return;
  try {
    const codes = generatePlainCodes(8);
    const hashes = await hashCodes(codes);
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    cfg.recoveryCodeHashes = hashes;
    await writeFile('admin-config.json', JSON.stringify(cfg, null, 2), data ? data.sha : null);
    mfaConfig = cfg;
    mfaRecoveryList.innerHTML = codes.map(c => `<code class="rcode">${c}</code>`).join('');
    mfaRecoveryWrap.style.display = '';
    mfaControls.style.display = 'none';
    mfaControlMsg.textContent = '';
  } catch (err) {
    mfaControlMsg.textContent = 'Error: ' + err.message; mfaControlMsg.className = 'form-msg error';
  }
});

/* Disable MFA */
mfaDisableBtn.addEventListener('click', async () => {
  if (!confirm('Disable MFA? Your authenticator app will stop working.')) return;
  try {
    const data = await readFileContent('admin-config.json');
    const cfg = data ? JSON.parse(data.content) : {};
    cfg.totpSecret = null;
    cfg.totpEnabled = false;
    cfg.recoveryCodeHashes = [];
    await writeFile('admin-config.json', JSON.stringify(cfg, null, 2), data ? data.sha : null);
    mfaConfig = cfg;
    mfaStatusLabel.innerHTML = 'Status: <span class="mfa-disabled">Disabled</span>';
    mfaControls.style.display = 'none';
    mfaEnableBtn.style.display = '';
    mfaControlMsg.textContent = 'MFA disabled.'; mfaControlMsg.className = 'form-msg success';
  } catch (err) {
    mfaControlMsg.textContent = 'Error: ' + err.message; mfaControlMsg.className = 'form-msg error';
  }
});

/* ===== RESTORE SESSION ===== */
(function init() {
  const savedToken = localStorage.getItem('adminToken');
  const savedOwner = localStorage.getItem('adminOwner');
  const savedRepo = localStorage.getItem('adminRepo');
  if (savedToken && savedOwner && savedRepo) {
    token = savedToken; owner = savedOwner; repo = savedRepo;
    document.getElementById('loginToken').value = savedToken;
    document.getElementById('loginOwner').value = savedOwner;
    document.getElementById('loginRepo').value = savedRepo;
    showDashboard();
  }
})();
