const SB_URL = 'https://plgymomwkwldzkavhmrz.supabase.co';
const SB_KEY = 'sb_publishable_zCQvFSq18qkosIGu9HbYEA_aJLF5OG_';

let _token = null;
let _pendingMfaSecret = null;

function _genSecret() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => c[x % 32]).join('');
}

function _totpUri(s, e, i) {
  return 'otpauth://totp/' + encodeURIComponent(i) + ':' + encodeURIComponent(e) + '?secret=' + s + '&issuer=' + encodeURIComponent(i) + '&algorithm=SHA1&digits=6&period=30';
}

function _base32Decode(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let b = 0, bc = 0;
  const r = [];
  for (const ch of s.toUpperCase()) {
    const idx = a.indexOf(ch);
    if (idx === -1) continue;
    b = (b << 5) | idx;
    bc += 5;
    if (bc >= 8) { bc -= 8; r.push((b >>> bc) & 0xff); }
  }
  return new Uint8Array(r);
}

function _totpCounter(t) {
  const b = new Uint8Array(8);
  let tmp = Math.floor(t / 30000);
  for (let i = 7; i >= 0; i--) { b[i] = tmp & 0xff; tmp >>>= 8; }
  return b;
}

function _totpCode(hmac) {
  const o = hmac[19] & 0x0f;
  return String((((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3]) % 1000000).padStart(6, '0');
}

async function _validateTOTP(code, secret) {
  try {
    const keyBytes = _base32Decode(secret);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const now = Date.now();
    for (let off = -1; off <= 1; off++) {
      const sig = await crypto.subtle.sign('HMAC', key, _totpCounter(now + off * 30000));
      if (_totpCode(new Uint8Array(sig)) === code) return true;
    }
  } catch (e) { console.error('TOTP validation error:', e); }
  return false;
}

function _getSessionEmail() {
  try { const s = JSON.parse(localStorage.getItem('sb-session')); return s?.user?.email || 'user'; } catch { return 'user'; }
}

function sbFetch(method, path, body, _noRetry) {
  const headers = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  return fetch(`${SB_URL}/${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => {
    const text = await r.text();
    if (r.status >= 400) {
      let msg = text;
      try { const j = JSON.parse(text); msg = j.message || j.error || j.msg || msg; } catch {}
      if (r.status === 401 && !_noRetry && msg.includes('JWT')) {
        return _refreshToken().then(() => sbFetch(method, path, body, true));
      }
      throw new Error(msg);
    }
    try { return JSON.parse(text); } catch { return text; }
  });
}

function _refreshToken() {
  const saved = localStorage.getItem('sb-session');
  if (!saved) return Promise.reject(new Error('No session'));
  try {
    const s = JSON.parse(saved);
    if (!s.refresh_token) return Promise.reject(new Error('No refresh token'));
    const oldToken = _token;
    _token = null;
    return sbFetch('POST', 'auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }, true)
      .then(data => {
        _token = oldToken;
        if (data.access_token) {
          _token = data.access_token;
          s.access_token = data.access_token;
          s.refresh_token = data.refresh_token || s.refresh_token;
          if (data.user) s.user = data.user;
          localStorage.setItem('sb-session', JSON.stringify(s));
        }
        return data;
      }).catch(err => { _token = oldToken; throw err; });
  } catch (e) { return Promise.reject(e); }
}

const sbAuth = {
  signInWithPassword: ({ email, password }) =>
    sbFetch('POST', 'auth/v1/token?grant_type=password', { email, password })
      .then(data => {
        if (data.access_token) {
          _token = data.access_token;
          const s = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
          try { localStorage.setItem('sb-session', JSON.stringify(s)); } catch {}
        }
        return { data, error: null };
      }).catch(err => ({ data: null, error: err })),

  signOut: () => {
    _token = null;
    try { localStorage.removeItem('sb-session'); } catch {}
    return Promise.resolve({ error: null });
  },

  getSession: () => {
    try {
      const saved = localStorage.getItem('sb-session');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.access_token) {
          _token = s.access_token;
          return Promise.resolve({ data: { session: s }, error: null });
        }
      }
    } catch {}
    return Promise.resolve({ data: { session: null }, error: null });
  },

  updateUser: (updates) => {
    const attempt = () =>
      sbFetch('PUT', 'auth/v1/user', updates).then(data => {
        try {
          const s = JSON.parse(localStorage.getItem('sb-session'));
          if (s) { s.user = data; localStorage.setItem('sb-session', JSON.stringify(s)); }
        } catch {}
        return { data, error: null };
      });
    return attempt().catch(err => {
      if (err.message && err.message.includes('JWT')) {
        return _refreshToken().then(attempt).catch(() => {
          try { localStorage.removeItem('sb-session'); } catch {}
          _token = null;
          return { data: null, error: new Error('Session expired. Please refresh the page and log in again.') };
        });
      }
      return { data: null, error: err };
    });
  }
};

sbAuth.getSession();

function sbMfaEnroll() {
  const secret = _genSecret();
  _pendingMfaSecret = secret;
  const email = _getSessionEmail();
  const uri = _totpUri(secret, email, 'Faith & Fellowship');
  return Promise.resolve({ data: { id: 'totp', totp: { qr_code: uri, secret: secret } }, error: null });
}

function sbMfaChallenge(factorId) {
  return sbFetch('GET', 'auth/v1/user').then(u => {
    if (!(u?.user_metadata?.totp_secret)) throw new Error('MFA not enrolled');
    return { data: { id: 'c' }, error: null };
  }).catch(err => ({ data: null, error: err }));
}

function sbMfaVerify(factorId, challengeId, code) {
  if (_pendingMfaSecret) {
    return _validateTOTP(code, _pendingMfaSecret).then(ok => {
      if (!ok) return { data: null, error: new Error('Invalid code') };
      const s = _pendingMfaSecret; _pendingMfaSecret = null;
      return sbAuth.updateUser({ data: { totp_secret: s } });
    });
  }
  return sbFetch('GET', 'auth/v1/user').then(u => {
    const s = u?.user_metadata?.totp_secret;
    if (!s) return { data: null, error: new Error('MFA not enrolled') };
    return _validateTOTP(code, s).then(ok => {
      if (!ok) return { data: null, error: new Error('Invalid code') };
      return { data: {}, error: null };
    });
  }).catch(err => ({ data: null, error: err }));
}

function sbMfaUnenroll(factorId) {
  return sbAuth.updateUser({ data: { totp_secret: '' } });
}

function sbMfaListFactors() {
  return sbFetch('GET', 'auth/v1/user').then(u => {
    if (u?.user_metadata?.totp_secret) return { data: [{ id: 'totp', type: 'totp', status: 'verified' }], error: null };
    return { data: [], error: null };
  }).catch(err => ({ data: null, error: err }));
}
