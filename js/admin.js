/* ===== STATE ===== */
let token = '';
let owner = '';
let repo = '';
let allPosts = [];
let editingId = null;
let _mfaFactorId = null;

/* ===== DOM REFS — VIEWS ===== */
const viewLogin = document.getElementById('viewLogin');
const viewDashboard = document.getElementById('viewDashboard');
const viewEditor = document.getElementById('viewEditor');

/* ===== DOM REFS — LOGIN ===== */
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginMfaStep = document.getElementById('loginMfaStep');
const loginMfaCode = document.getElementById('loginMfaCode');
const loginMfaBtn = document.getElementById('loginMfaBtn');
const loginMfaError = document.getElementById('loginMfaError');
const loginMfaEnroll = document.getElementById('loginMfaEnroll');
const loginMfaQr = document.getElementById('loginMfaQr');
const loginMfaSecret = document.getElementById('loginMfaSecret');
const loginMfaEnrollCode = document.getElementById('loginMfaEnrollCode');
const loginMfaEnrollBtn = document.getElementById('loginMfaEnrollBtn');
const loginMfaEnrollError = document.getElementById('loginMfaEnrollError');

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

/* ===== DOM REFS — GITHUB ===== */
const githubForm = document.getElementById('githubForm');
const githubToken = document.getElementById('githubToken');
const githubOwner = document.getElementById('githubOwner');
const githubRepo = document.getElementById('githubRepo');
const githubSaveBtn = document.getElementById('githubSaveBtn');
const githubMsg = document.getElementById('githubMsg');
const githubStatus = document.getElementById('githubStatus');

/* ===== DOM REFS — ACCOUNT ===== */
const passwordForm = document.getElementById('passwordForm');
const pwMsg = document.getElementById('pwMsg');
const pwSaveBtn = document.getElementById('pwSaveBtn');
const mfaStatus = document.getElementById('mfaStatus');
const mfaEnroll = document.getElementById('mfaEnroll');
const mfaStartEnrollBtn = document.getElementById('mfaStartEnrollBtn');
const mfaEnrollStep = document.getElementById('mfaEnrollStep');
const mfaQr = document.getElementById('mfaQr');
const mfaSecret = document.getElementById('mfaSecret');
const mfaVerifyCode = document.getElementById('mfaVerifyCode');
const mfaVerifyBtn = document.getElementById('mfaVerifyBtn');
const mfaEnrollMsg = document.getElementById('mfaEnrollMsg');
const mfaActive = document.getElementById('mfaActive');
const mfaDisableBtn = document.getElementById('mfaDisableBtn');
const mfaDisableMsg = document.getElementById('mfaDisableMsg');

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
  return { content: decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))), sha: data.sha };
}

async function writeFile(path, content, sha = null) {
  const body = { message: `Update ${path}`, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  return ghFetch(`contents/${path}`, 'PUT', body);
}

async function deleteFile(path, sha) {
  return ghFetch(`contents/${path}`, 'DELETE', { message: `Delete ${path}`, sha });
}

/* ===== LOGIN ===== */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { loginError.textContent = 'Please enter your email and password.'; return; }
  loginError.textContent = 'Signing in...';
  try {
    const { data, error } = await sbAuth.signInWithPassword({ email, password });
    if (error) throw error;
    const verified = (data?.factors || []).filter(f => f.type === 'totp' && f.status === 'verified');
    if (verified.length) {
      _mfaFactorId = verified[0].id;
      loginForm.style.display = 'none';
      loginMfaStep.style.display = '';
      loginMfaCode.focus();
      return;
    }
    showLoginMfaEnroll();
  } catch (err) { loginError.textContent = 'Login failed: ' + err.message; }
});

loginMfaBtn.addEventListener('click', async () => {
  const code = loginMfaCode.value.trim();
  if (!code || code.length !== 6) { loginMfaError.textContent = 'Enter a 6-digit code.'; return; }
  loginMfaError.textContent = 'Verifying...';
  loginMfaBtn.disabled = true;
  try {
    const { data: chal, error: chalErr } = await sbMfaChallenge(_mfaFactorId);
    if (chalErr) throw chalErr;
    const { error: verErr } = await sbMfaVerify(_mfaFactorId, chal.id, code);
    if (verErr) throw verErr;
    showDashboard();
  } catch (err) {
    loginMfaError.textContent = 'MFA failed: ' + err.message;
    loginMfaBtn.disabled = false;
  }
});

let _loginEnrollFactorId = null;

async function showLoginMfaEnroll() {
  loginForm.style.display = 'none';
  loginMfaEnroll.style.display = '';
  loginMfaEnrollError.textContent = '';
  try {
    const { data, error } = await sbMfaEnroll();
    if (error) throw error;
    _loginEnrollFactorId = data.id;
    loginMfaSecret.textContent = data.totp.secret;
    loginMfaQr.innerHTML = '';
    new QRCode(loginMfaQr, { text: data.totp.qr_code, width: 180, height: 180, colorDark: '#1E3D63', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.H });
  } catch (err) { loginMfaEnrollError.textContent = 'Error starting MFA enrollment: ' + err.message; }
}

loginMfaEnrollBtn.addEventListener('click', async () => {
  const code = loginMfaEnrollCode.value.trim();
  if (!code || code.length !== 6) { loginMfaEnrollError.textContent = 'Enter a 6-digit code.'; return; }
  loginMfaEnrollError.textContent = 'Verifying...';
  loginMfaEnrollBtn.disabled = true;
  try {
    const { data: chal, error: chalErr } = await sbMfaChallenge(_loginEnrollFactorId);
    if (chalErr) throw chalErr;
    const { error: verErr } = await sbMfaVerify(_loginEnrollFactorId, chal.id, code);
    if (verErr) throw verErr;
    showDashboard();
  } catch (err) {
    loginMfaEnrollError.textContent = 'MFA enrollment failed: ' + err.message;
    loginMfaEnrollBtn.disabled = false;
  }
});

/* ===== VIEWS ===== */
function showView(view) {
  [viewLogin, viewDashboard, viewEditor].forEach(v => v.style.display = 'none');
  view.style.display = '';
  if (view === viewLogin) {
    loginForm.style.display = '';
    loginMfaStep.style.display = 'none';
    loginMfaCode.value = '';
    loginMfaError.textContent = '';
    loginMfaBtn.disabled = false;
    loginError.textContent = '';
    loginMfaEnroll.style.display = 'none';
    loginMfaEnrollCode.value = '';
    loginMfaEnrollError.textContent = '';
    loginMfaEnrollBtn.disabled = false;
  }
}

function showDashboard() {
  showView(viewDashboard);
  if (token && owner && repo) {
    switchTab('posts');
  } else {
    switchTab('github');
    githubStatus.innerHTML = '⚠️ GitHub credentials not configured. Enter them below to enable saving posts and settings.';
  }
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
  if (tabId === 'github') loadGitHubStatus();
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

logoutBtn.addEventListener('click', async () => {
  await sbAuth.signOut().catch(() => {});
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

/* ===== IMAGE UPLOAD ===== */
const edImageFile = document.getElementById('edImageFile');
const edImageUploadBtn = document.getElementById('edImageUploadBtn');

edImageUploadBtn.addEventListener('click', () => edImageFile.click());

edImageFile.addEventListener('change', async () => {
  const file = edImageFile.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Image too large. Max 5MB.');
    edImageFile.value = '';
    return;
  }

  const ext = file.name.split('.').pop();
  const filename = `images/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

  edImageUploadBtn.textContent = 'Uploading...';
  edImageUploadBtn.disabled = true;

  try {
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const sha = await getFileSha(filename);
    await ghFetch(`contents/${filename}`, 'PUT', {
      message: `Upload ${filename}`,
      content: base64,
      sha: sha || undefined
    });

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
    edImage.value = url;
    edImageUploadBtn.textContent = 'Upload';
    edImageUploadBtn.disabled = false;
    edImageFile.value = '';
  } catch (err) {
    alert('Upload failed: ' + err.message);
    edImageUploadBtn.textContent = 'Upload';
    edImageUploadBtn.disabled = false;
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

/* ===== GITHUB SETTINGS ===== */
function loadGitHubStatus() {
  if (token && owner && repo) {
    githubStatus.innerHTML = '✅ GitHub is configured (<code>' + escHtml(owner) + '/' + escHtml(repo) + '</code>)';
    githubToken.value = token;
    githubOwner.value = owner;
    githubRepo.value = repo;
  } else {
    githubStatus.innerHTML = '⚠️ GitHub credentials not configured. Enter them below to enable saving posts and settings.';
  }
}

githubForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  githubMsg.textContent = 'Saving...'; githubMsg.className = 'form-msg';
  githubSaveBtn.disabled = true;
  const newToken = githubToken.value.trim();
  const newOwner = githubOwner.value.trim();
  const newRepo = githubRepo.value.trim();
  if (!newToken || !newOwner || !newRepo) {
    githubMsg.textContent = 'All fields are required.'; githubMsg.className = 'form-msg error';
    githubSaveBtn.disabled = false; return;
  }
  try {
    const { error } = await sbAuth.updateUser({ data: { github_token: newToken, github_owner: newOwner, github_repo: newRepo } });
    if (error) throw error;
    token = newToken; owner = newOwner; repo = newRepo;
    githubMsg.textContent = 'GitHub settings saved!'; githubMsg.className = 'form-msg success';
    githubStatus.innerHTML = '✅ GitHub is configured (<code>' + escHtml(owner) + '/' + escHtml(repo) + '</code>)';
  } catch (err) {
    githubMsg.textContent = 'Error: ' + err.message; githubMsg.className = 'form-msg error';
  }
  githubSaveBtn.disabled = false;
});

/* ===== CHANGE PASSWORD ===== */
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  pwMsg.textContent = ''; pwMsg.className = 'form-msg';
  pwSaveBtn.disabled = true;
  const newPw = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  if (newPw.length < 6) { pwMsg.textContent = 'Password must be at least 6 characters.'; pwMsg.className = 'form-msg error'; pwSaveBtn.disabled = false; return; }
  if (newPw !== confirm) { pwMsg.textContent = 'Passwords do not match.'; pwMsg.className = 'form-msg error'; pwSaveBtn.disabled = false; return; }
  try {
    const { error } = await sbAuth.updateUser({ password: newPw });
    if (error) throw error;
    pwMsg.textContent = 'Password updated!'; pwMsg.className = 'form-msg success';
    passwordForm.reset();
  } catch (err) { pwMsg.textContent = 'Error: ' + err.message; pwMsg.className = 'form-msg error'; }
  pwSaveBtn.disabled = false;
});

/* ===== MFA ===== */
async function loadMfaStatus() {
  mfaEnroll.style.display = 'none';
  mfaActive.style.display = 'none';
  mfaStatus.innerHTML = 'Status: <span class="mfa-disabled">Checking...</span>';
  try {
    const { data: factors, error } = await sbMfaListFactors();
    if (error) throw error;
    const verified = (factors || []).filter(f => f.type === 'totp' && f.status === 'verified');
    if (verified.length) {
      _mfaFactorId = verified[0].id;
      mfaActive.style.display = '';
      mfaStatus.innerHTML = 'Status: <span class="mfa-enabled">Enabled</span>';
    } else {
      mfaEnroll.style.display = '';
      mfaStatus.innerHTML = 'Status: <span class="mfa-disabled">Disabled</span>';
    }
  } catch (err) { mfaStatus.innerHTML = 'Status: <span class="mfa-disabled">Error</span>'; }
}

mfaStartEnrollBtn.addEventListener('click', async () => {
  mfaEnrollMsg.textContent = ''; mfaEnrollMsg.className = 'form-msg';
  mfaStartEnrollBtn.style.display = 'none';
  mfaEnrollStep.style.display = '';
  try {
    const { data, error } = await sbMfaEnroll();
    if (error) throw error;
    window._mfaEnrollFactorId = data.id;
    mfaSecret.textContent = data.totp.secret;
    mfaQr.innerHTML = '';
    new QRCode(mfaQr, { text: data.totp.qr_code, width: 180, height: 180, colorDark: '#1E3D63', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.H });
  } catch (err) { mfaEnrollMsg.textContent = 'Error: ' + err.message; mfaEnrollMsg.className = 'form-msg error'; }
});

mfaVerifyBtn.addEventListener('click', async () => {
  const code = mfaVerifyCode.value.trim();
  if (!code || code.length !== 6) { mfaEnrollMsg.textContent = 'Enter a 6-digit code.'; mfaEnrollMsg.className = 'form-msg error'; return; }
  mfaEnrollMsg.textContent = 'Verifying...'; mfaEnrollMsg.className = 'form-msg';
  mfaVerifyBtn.disabled = true;
  try {
    const { data: chal, error: chalErr } = await sbMfaChallenge(window._mfaEnrollFactorId);
    if (chalErr) throw chalErr;
    const { error: verErr } = await sbMfaVerify(window._mfaEnrollFactorId, chal.id, code);
    if (verErr) throw verErr;
    mfaEnrollMsg.textContent = 'MFA enabled!'; mfaEnrollMsg.className = 'form-msg success';
    mfaEnrollStep.style.display = 'none';
    mfaEnroll.style.display = 'none';
    mfaActive.style.display = '';
    mfaStatus.innerHTML = 'Status: <span class="mfa-enabled">Enabled</span>';
    _mfaFactorId = window._mfaEnrollFactorId;
  } catch (err) {
    mfaEnrollMsg.textContent = 'Error: ' + err.message; mfaEnrollMsg.className = 'form-msg error';
    mfaVerifyBtn.disabled = false;
  }
});

mfaDisableBtn.addEventListener('click', async () => {
  if (!confirm('Disable MFA? Your authenticator app will stop working.')) return;
  mfaDisableMsg.textContent = 'Disabling...'; mfaDisableMsg.className = 'form-msg';
  mfaDisableBtn.disabled = true;
  try {
    const { error } = await sbMfaUnenroll(_mfaFactorId);
    if (error) throw error;
    mfaDisableMsg.textContent = 'MFA disabled.'; mfaDisableMsg.className = 'form-msg success';
    mfaActive.style.display = 'none';
    mfaEnroll.style.display = '';
    mfaStatus.innerHTML = 'Status: <span class="mfa-disabled">Disabled</span>';
    _mfaFactorId = null;
  } catch (err) {
    mfaDisableMsg.textContent = 'Error: ' + err.message; mfaDisableMsg.className = 'form-msg error';
    mfaDisableBtn.disabled = false;
  }
});

document.getElementById('sessionLogoutBtn').addEventListener('click', async () => {
  if (!confirm('Sign out of all active sessions?')) return;
  try {
    const { error } = await sbAuth.signOut();
    if (error) throw error;
    document.getElementById('sessionMsg').textContent = 'Signed out globally. Redirecting...';
    document.getElementById('sessionMsg').className = 'form-msg success';
    setTimeout(() => showView(viewLogin), 1000);
  } catch (err) {
    document.getElementById('sessionMsg').textContent = 'Error: ' + err.message;
    document.getElementById('sessionMsg').className = 'form-msg error';
  }
});

/* ===== RESTORE SESSION ===== */
sbAuth.getSession().then(async ({ data: { session } }) => {
  if (session?.user?.user_metadata?.github_token) {
    const meta = session.user.user_metadata;
    if (meta.github_token && meta.github_owner && meta.github_repo) {
      token = meta.github_token;
      owner = meta.github_owner;
      repo = meta.github_repo;
    }
  }
  if (session) showDashboard();
});
