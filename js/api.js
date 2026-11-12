// File ID: F03 | Revision: R1 — klien API Apps Script
import { API_URL } from './config.js';

const K = { token: 'tm_token', me: 'tm_me', tasks: 'tm_tasks', users: 'tm_users' };

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Produksi: URL Apps Script. Preview lokal (tools/dev-server.js): path same-origin di localhost.
const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(location.hostname) && API_URL.startsWith('/');
export const apiConfigured = () => /^https:\/\/script\.google\.com\//.test(API_URL) || isLocalPreview();

async function call(action, payload = {}) {
  if (!navigator.onLine) throw new ApiError('Sedang offline', 0);
  const token = localStorage.getItem(K.token) || '';
  let res;
  try {
    // text/plain = "simple request" -> tanpa CORS preflight (Apps Script tidak melayani OPTIONS)
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...payload }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('Gagal terhubung ke server', 0);
  }
  let j;
  try {
    j = await res.json();
  } catch {
    throw new ApiError('Respons server tidak valid. Cek URL & deployment Apps Script.', 500);
  }
  if (!j.ok) {
    if (j.code === 401 && action !== 'login') clearSession();
    throw new ApiError(j.error || 'Error', j.code || 500);
  }
  return j.data;
}

const readJSON = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};

export const api = {
  async users() {
    const d = await call('users');
    localStorage.setItem(K.users, JSON.stringify(d));
    return d;
  },
  async login(nama, pin) {
    const d = await call('login', { nama, pin });
    localStorage.setItem(K.token, d.token);
    localStorage.setItem(K.me, JSON.stringify({ nama: d.nama, role: d.role, exp: d.exp }));
    return d;
  },
  async list() {
    const d = await call('list');
    localStorage.setItem(K.tasks, JSON.stringify({ ...d, at: Date.now() }));
    return d;
  },
  create: (task) => call('create', { task }),
  update: (id, version, task) => call('update', { id, version, task }),
  move: (id, version, to, note) => call('move', { id, version, to, note }),
  archive: (id, version, on) => call('archive', { id, version, on }),
  archiveAll: (status, pribadi) => call('archiveAll', { status, pribadi }),
};

export function session() {
  const m = readJSON(K.me);
  return m && m.exp > Date.now() && localStorage.getItem(K.token) ? m : null;
}

export function clearSession() {
  localStorage.removeItem(K.token);
  localStorage.removeItem(K.me);
  localStorage.removeItem(K.tasks); // HP bisa dipakai bergantian
}

export const cachedTasks = () => readJSON(K.tasks);
export const cachedUsers = () => readJSON(K.users) || [];
