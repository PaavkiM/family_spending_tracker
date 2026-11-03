/* ───────────────────────────────────────────────────────────
   Family Spending Tracker — frontend logic
   ─────────────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  categories: [],
  filters: { month: '', year: '', category_id: '' },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ─── API helper ──────────────────────────────────────────── */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Not authenticated');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ─── Formatting ──────────────────────────────────────────── */
// Canadian dollar formatting: e.g. 1234.5 -> "$1,234.50"
const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  currencyDisplay: 'narrowSymbol',
});

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ─── Auth ────────────────────────────────────────────────── */
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  $('#login-password').focus();
}
function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

async function checkAuth() {
  try {
    const { authenticated } = await api('/auth/status');
    if (authenticated) {
      showApp();
      await init();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.textContent = '';
  btn.disabled = true;
  try {
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#login-password').value }),
    });
    $('#login-password').value = '';
    showApp();
    await init();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

/* ─── Init / data load ────────────────────────────────────── */
async function init() {
  populateFilterDates();
  await loadCategories();
  await loadEntries();
}

function populateFilterDates() {
  const monthSel = $('#filter-month');
  const yearSel = $('#filter-year');
  if (monthSel.options.length > 1) return; // already done

  MONTHS.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1);
    opt.textContent = name;
    monthSel.appendChild(opt);
  });

  const nowYear = new Date().getFullYear();
  for (let y = nowYear + 1; y >= nowYear - 6; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }
}

async function loadCategories() {
  state.categories = await api('/categories');
  // Fill the filter dropdown.
  const filterSel = $('#filter-category');
  const current = filterSel.value;
  filterSel.innerHTML = '<option value="">All categories</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name;
    filterSel.appendChild(opt);
  });
  filterSel.value = current;

  // Fill the entry-form dropdown.
  const entrySel = $('#entry-category');
  entrySel.innerHTML = '<option value="">Uncategorized</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name;
    entrySel.appendChild(opt);
  });
}

async function loadEntries() {
  const params = new URLSearchParams();
  if (state.filters.month) params.set('month', state.filters.month);
  if (state.filters.year) params.set('year', state.filters.year);
  if (state.filters.category_id) params.set('category_id', state.filters.category_id);

  const data = await api(`/entries?${params.toString()}`);
  renderEntries(data.entries);
  $('#stat-total').textContent = money.format(data.summary.total);
  $('#stat-count').textContent = data.summary.count;
}

/* ─── Rendering ───────────────────────────────────────────── */
function renderEntries(entries) {
  const list = $('#entries-list');
  const empty = $('#empty-state');
  list.innerHTML = '';

  if (!entries.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'entry-row';

    const dot = document.createElement('span');
    dot.className = 'cat-dot';
    dot.style.background = e.category_color || '#94a3b8';

    const main = document.createElement('div');
    main.className = 'entry-main';

    const desc = document.createElement('div');
    desc.className = 'entry-desc';
    desc.textContent = e.description;
    if (e.is_recurring) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-recurring';
      badge.textContent = `↻ ${e.recur_interval}`;
      desc.appendChild(badge);
    }

    const sub = document.createElement('div');
    sub.className = 'entry-sub';
    const catName = e.category_name || 'Uncategorized';
    sub.textContent = `${formatDate(e.occurrence_date)} · ${catName}`;

    main.append(desc, sub);

    const amount = document.createElement('div');
    amount.className = 'entry-amount';
    amount.textContent = money.format(e.amount);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openEntryModal(e.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => confirmDeleteEntry(e.id, e.description));
    actions.append(editBtn, delBtn);

    row.append(dot, main, amount, actions);
    list.appendChild(row);
  });
}

/* ─── Filters ─────────────────────────────────────────────── */
['filter-month', 'filter-year', 'filter-category'].forEach((id) => {
  $(`#${id}`).addEventListener('change', () => {
    state.filters.month = $('#filter-month').value;
    state.filters.year = $('#filter-year').value;
    state.filters.category_id = $('#filter-category').value;
    loadEntries().catch((e) => toast(e.message, true));
  });
});

$('#reset-filters').addEventListener('click', () => {
  state.filters = { month: '', year: '', category_id: '' };
  $('#filter-month').value = '';
  $('#filter-year').value = '';
  $('#filter-category').value = '';
  loadEntries().catch((e) => toast(e.message, true));
});

/* ─── Modals: generic open/close ──────────────────────────── */
function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

$$('[data-close]').forEach((el) => {
  el.addEventListener('click', () => {
    const modal = el.closest('.modal');
    if (modal) modal.classList.add('hidden');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$('.modal').forEach((m) => m.classList.add('hidden'));
});

/* ─── Entry modal ─────────────────────────────────────────── */
$('#open-add-card').addEventListener('click', () => openEntryModal());

function resetEntryForm() {
  $('#entry-id').value = '';
  $('#entry-description').value = '';
  $('#entry-amount').value = '';
  $('#entry-date').value = new Date().toISOString().slice(0, 10);
  $('#entry-category').value = '';
  $('#entry-recurring').checked = false;
  $('#entry-interval').value = 'monthly';
  $('#entry-forever').checked = true;
  $('#entry-until').value = '';
  $('#entry-error').textContent = '';
  syncRecurringUI();
}

function syncRecurringUI() {
  const recurring = $('#entry-recurring').checked;
  $('#recurring-options').classList.toggle('hidden', !recurring);
  const forever = $('#entry-forever').checked;
  $('#until-field').classList.toggle('hidden', forever);
}

$('#entry-recurring').addEventListener('change', syncRecurringUI);
$('#entry-forever').addEventListener('change', syncRecurringUI);

async function openEntryModal(id = null) {
  resetEntryForm();
  if (id) {
    $('#entry-modal-title').textContent = 'Edit entry';
    try {
      const e = await api(`/entries/${id}`);
      $('#entry-id').value = e.id;
      $('#entry-description').value = e.description;
      $('#entry-amount').value = e.amount;
      $('#entry-date').value = e.spent_on;
      $('#entry-category').value = e.category_id ? String(e.category_id) : '';
      $('#entry-recurring').checked = e.is_recurring;
      if (e.is_recurring) {
        $('#entry-interval').value = e.recur_interval;
        $('#entry-forever').checked = !e.recur_until;
        $('#entry-until').value = e.recur_until || '';
      }
      syncRecurringUI();
    } catch (err) {
      toast(err.message, true);
      return;
    }
  } else {
    $('#entry-modal-title').textContent = 'Add entry';
  }
  openModal('entry-modal');
  $('#entry-description').focus();
}

$('#entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#entry-error');
  err.textContent = '';
  const btn = $('#entry-save-btn');

  const recurring = $('#entry-recurring').checked;
  const forever = $('#entry-forever').checked;
  const payload = {
    description: $('#entry-description').value.trim(),
    amount: $('#entry-amount').value,
    spent_on: $('#entry-date').value,
    category_id: $('#entry-category').value || null,
    is_recurring: recurring,
    recur_interval: recurring ? $('#entry-interval').value : 'none',
    recur_until: recurring && !forever ? ($('#entry-until').value || null) : null,
  };

  if (recurring && !forever && !payload.recur_until) {
    err.textContent = 'Pick an end date, or turn on "recurring forever".';
    return;
  }

  const id = $('#entry-id').value;
  btn.disabled = true;
  try {
    if (id) {
      await api(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Entry updated');
    } else {
      await api('/entries', { method: 'POST', body: JSON.stringify(payload) });
      toast('Entry added');
    }
    closeModal('entry-modal');
    await loadEntries();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});

/* ─── Delete confirm ──────────────────────────────────────── */
let confirmAction = null;
$('#confirm-ok').addEventListener('click', async () => {
  if (confirmAction) await confirmAction();
  closeModal('confirm-modal');
});

function confirmDeleteEntry(id, description) {
  $('#confirm-message').textContent = `Delete "${description}"? This can't be undone.`;
  confirmAction = async () => {
    try {
      await api(`/entries/${id}`, { method: 'DELETE' });
      toast('Entry deleted');
      await loadEntries();
    } catch (e) {
      toast(e.message, true);
    }
  };
  openModal('confirm-modal');
}

/* ─── Categories modal ────────────────────────────────────── */
$('#manage-categories-btn').addEventListener('click', () => {
  renderCategoryList();
  $('#category-error').textContent = '';
  openModal('category-modal');
});

function renderCategoryList() {
  const list = $('#category-list');
  list.innerHTML = '';
  state.categories.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'category-item';

    const dot = document.createElement('span');
    dot.className = 'cat-dot';
    dot.style.background = c.color;

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = c.name;

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Delete category';
    del.textContent = '🗑';
    del.addEventListener('click', () => confirmDeleteCategory(c.id, c.name));

    item.append(dot, name, del);
    list.appendChild(item);
  });
}

$('#category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#category-error');
  err.textContent = '';
  try {
    await api('/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: $('#category-name').value.trim(),
        color: $('#category-color').value,
      }),
    });
    $('#category-name').value = '';
    await loadCategories();
    renderCategoryList();
    toast('Category added');
  } catch (e) {
    err.textContent = e.message;
  }
});

function confirmDeleteCategory(id, name) {
  $('#confirm-message').textContent =
    `Delete category "${name}"? Existing entries will become uncategorized.`;
  confirmAction = async () => {
    try {
      await api(`/categories/${id}`, { method: 'DELETE' });
      await loadCategories();
      renderCategoryList();
      await loadEntries();
      toast('Category deleted');
    } catch (e) {
      toast(e.message, true);
    }
  };
  openModal('confirm-modal');
}

/* ─── Go ──────────────────────────────────────────────────── */
checkAuth();
