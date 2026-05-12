// ===== ROLE DEFINITIONS =====
const ROLES = [
  { id: 'singer',     label: 'Singer',     icon: '🎤', color: '#f56bab' },
  { id: 'guitarist',  label: 'Guitarist',  icon: '🎸', color: '#5b8cff' },
  { id: 'bassist',    label: 'Bassist',    icon: '🎵', color: '#9b72f5' },
  { id: 'drummer',    label: 'Drummer',    icon: '🥁', color: '#f5a623' },
  { id: 'keys',       label: 'Keys',       icon: '🎹', color: '#3ecf8e' },
  { id: 'harmonica',  label: 'Harmonica',  icon: '🎼', color: '#56cfe1' },
  { id: 'violinist',  label: 'Violinist',  icon: '🎻', color: '#e56bab' },
  { id: 'flutist',    label: 'Flutist',    icon: '🪈', color: '#ffd166' },
  { id: 'ukulele',    label: 'Ukulele',    icon: '🪕', color: '#06d6a0' },
  { id: 'horn',       label: 'Horn',       icon: '🎺', color: '#ef476f' },
  { id: 'cello',      label: 'Cello',      icon: '🎻', color: '#c44536' },
  { id: 'saxophone',  label: 'Saxophone',  icon: '🎷', color: '#fca311' },
  { id: 'percussion', label: 'Percussion', icon: '🪘', color: '#8b5a2b' },
  { id: 'accordion',  label: 'Accordion',  icon: '🪗', color: '#d90429' },
  { id: 'banjo',      label: 'Banjo',      icon: '🪕', color: '#ffb703' },
  { id: 'synth',      label: 'Synth/DJ',   icon: '🎛️', color: '#00f5d4' },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));

const AVATAR_COLORS = [
  ['#1a1a2e','#5b8cff'], ['#1a1a2e','#f5a623'], ['#1a1a2e','#9b72f5'],
  ['#1a1a2e','#3ecf8e'], ['#1a1a2e','#f56bab'], ['#1a1a2e','#56cfe1'],
];

const API = '/api/musicians';

// ===== STATE =====
let musicians = [];   // in-memory cache from server
let state = {
  filter:    'all',
  search:    '',
  modalMode: null,
  editingId: null,
  editRoles: [],
  editSongs: {},
};

// ===== API HELPERS =====
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadMusicians() {
  showGridLoading();
  musicians = await apiFetch(API);
  renderMusicians();
}

// ===== UTILS =====
function getInitials(name) {
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
}

// ===== FILTER =====
function getFilteredMusicians() {
  let list = musicians;
  const q = state.search.toLowerCase().trim();
  if (q) {
    list = list.filter(m => {
      if (m.name.toLowerCase().includes(q)) return true;
      return Object.values(m.songs).flat().some(s => s.toLowerCase().includes(q));
    });
  }
  if (state.filter !== 'all') {
    list = list.filter(m => m.roles.includes(state.filter));
  }
  return list;
}

// ===== RENDER =====
function showGridLoading() {
  const grid = document.getElementById('musicians-grid');
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon" style="animation:pulse 1.2s ease infinite">🎸</div>
      <div class="empty-title">Loading the crew…</div>
    </div>`;
}

function renderMusicians() {
  const grid = document.getElementById('musicians-grid');
  const list = getFilteredMusicians();
  const total = musicians.length;

  document.querySelector('.section-count').textContent =
    list.length === total
      ? `${total} member${total !== 1 ? 's' : ''}`
      : `${list.length} of ${total}`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🎸</div>
        <div class="empty-title">No musicians found</div>
        <p class="empty-desc">Try a different search or be the first to join!</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(m => renderCard(m)).join('');

  grid.querySelectorAll('.musician-card').forEach(card => {
    card.querySelector('.btn-view').addEventListener('click', e => {
      e.stopPropagation();
      openViewModal(card.dataset.id);
    });
    card.querySelector('.btn-edit').addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(card.dataset.id);
    });
    card.querySelector('.btn-del').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Remove ${card.dataset.name} from the session?`)) return;
      try {
        await apiFetch(`${API}/${card.dataset.id}`, { method: 'DELETE' });
        musicians = musicians.filter(m => m.id !== card.dataset.id);
        renderMusicians();
        toast('Member removed', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function renderCard(m) {
  const accentColor = ROLE_MAP[m.roles[0]]?.color || '#5b8cff';

  const rolesHtml = m.roles.map(rid => {
    const role = ROLE_MAP[rid];
    if (!role) return '';
    return `<span class="role-badge" style="background:${role.color}18;color:${role.color};border:1px solid ${role.color}33">
      ${role.icon} ${role.label}
    </span>`;
  }).join('');

  const songsHtml = m.roles.map(rid => {
    const role = ROLE_MAP[rid];
    if (!role) return '';
    const songs = (m.songs[rid] || []).slice(0, 3);
    const extra = (m.songs[rid] || []).length - 3;
    return `<div class="role-songs-block">
      <div class="role-songs-label">${role.icon} ${role.label}</div>
      <div class="songs-list">
        ${songs.length === 0
          ? '<div class="no-songs">No songs added yet</div>'
          : songs.map(s => `<div class="song-item">${s}</div>`).join('')}
        ${extra > 0 ? `<div class="song-item" style="color:var(--text-muted);font-style:italic">+${extra} more</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const songCount = Object.values(m.songs).flat().length;

  return `
    <div class="musician-card" data-id="${m.id}" data-name="${m.name}"
         style="--accent-color:${accentColor}22">
      <div class="card-header">
        <div class="avatar" style="background:${accentColor}22;color:${accentColor}">
          ${getInitials(m.name)}
        </div>
        <div>
          <div class="card-name">${m.name}</div>
          <div class="card-meta">${songCount} song${songCount !== 1 ? 's' : ''} · ${m.roles.length} role${m.roles.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="roles-list">${rolesHtml}</div>
      <div class="card-songs">${songsHtml}</div>
      <div class="card-footer">
        <button class="btn btn-secondary btn-view" style="flex:1;justify-content:center">👁 View All</button>
        <button class="btn btn-secondary btn-edit" style="flex:1;justify-content:center">✏️ Edit</button>
        <button class="btn btn-danger btn-del" title="Remove member">🗑</button>
      </div>
    </div>`;
}

function renderFilterChips() {
  const bar = document.getElementById('filter-bar');
  const all = `<div class="chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">🎶 All</div>`;
  const chips = ROLES.map(r => `
    <div class="chip ${state.filter === r.id ? 'active' : ''}" data-filter="${r.id}">
      <span class="chip-icon">${r.icon}</span>${r.label}
    </div>`).join('');
  bar.innerHTML = all + chips;
  bar.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      state.filter = c.dataset.filter;
      renderFilterChips();
      renderMusicians();
    });
  });
}

// ===== VIEW MODAL =====
function openViewModal(id) {
  const m = musicians.find(x => x.id === id);
  if (!m) return;
  const accentColor = ROLE_MAP[m.roles[0]]?.color || '#5b8cff';

  const rolesHtml = m.roles.map(rid => {
    const role = ROLE_MAP[rid];
    if (!role) return '';
    const songs = m.songs[rid] || [];
    return `<div class="detail-role-block">
      <div class="detail-role-heading" style="color:${role.color}">
        ${role.icon} ${role.label}
        <span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">
          — ${songs.length} song${songs.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div class="detail-songs-list">
        ${songs.length === 0
          ? '<div class="no-songs">No songs listed yet</div>'
          : songs.map(s => `<div class="detail-song">${s}</div>`).join('')}
      </div>
    </div>`;
  }).join('');

  const songCount = Object.values(m.songs).flat().length;

  setModalContent(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div class="avatar" style="background:${accentColor}22;color:${accentColor}">
          ${getInitials(m.name)}
        </div>
        <div>
          <div class="modal-title">${m.name}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.1rem">
            ${songCount} song${songCount !== 1 ? 's' : ''} · ${m.roles.length} role${m.roles.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="detail-roles">${rolesHtml}</div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="modal-edit-btn">✏️ Edit Profile</button>
    </div>
  `);

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-edit-btn').addEventListener('click', () => {
    closeModal();
    setTimeout(() => openEditModal(id), 200);
  });
  openModal();
}

// ===== ADD / EDIT MODAL =====
function openAddModal() {
  state.editingId = null;
  state.editRoles = [];
  state.editSongs = {};
  renderEditModal('Add Yourself 🎸');
}

function openEditModal(id) {
  const m = musicians.find(x => x.id === id);
  if (!m) return;
  state.editingId = id;
  state.editRoles = [...m.roles];
  state.editSongs = JSON.parse(JSON.stringify(m.songs));
  renderEditModal(`Edit: ${m.name}`);
  document.getElementById('edit-name').value = m.name;
}

function renderEditModal(title) {
  setModalContent(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>

    <div class="form-group">
      <label class="form-label" for="edit-name">Your Name</label>
      <input id="edit-name" class="form-input" type="text" placeholder="e.g. Carlos" autocomplete="off" />
    </div>

    <div class="form-group">
      <label class="form-label">Instruments / Roles</label>
      <div class="roles-grid" id="roles-grid"></div>
    </div>

    <div class="form-group" id="songs-section" style="display:none">
      <label class="form-label">Songs per Role</label>
      <div class="songs-editor" id="songs-editor"></div>
    </div>

    <div class="form-actions">
      <button class="btn btn-secondary" id="modal-close-btn2">Cancel</button>
      <button class="btn btn-primary" id="modal-save-btn">Save Member</button>
    </div>
  `);

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn2').addEventListener('click', closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', saveEdit);

  renderRolesGrid();
  renderSongsEditor();
  openModal();
}

function renderRolesGrid() {
  const grid = document.getElementById('roles-grid');
  if (!grid) return;
  grid.innerHTML = ROLES.map(r => `
    <div class="role-toggle ${state.editRoles.includes(r.id) ? 'selected' : ''}" data-role="${r.id}">
      <span class="rt-icon">${r.icon}</span>${r.label}
    </div>`).join('');
  grid.querySelectorAll('.role-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const rid = el.dataset.role;
      if (state.editRoles.includes(rid)) {
        state.editRoles = state.editRoles.filter(r => r !== rid);
      } else {
        state.editRoles.push(rid);
        if (!state.editSongs[rid]) state.editSongs[rid] = [];
      }
      renderRolesGrid();
      renderSongsEditor();
    });
  });
}

function renderSongsEditor() {
  const section = document.getElementById('songs-section');
  const editor  = document.getElementById('songs-editor');
  if (!section || !editor) return;

  if (state.editRoles.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';

  editor.innerHTML = state.editRoles.map(rid => {
    const role  = ROLE_MAP[rid];
    if (!role) return '';
    const songs = state.editSongs[rid] || [];
    return `
      <div class="songs-editor-block" data-role="${rid}">
        <div class="songs-editor-label" style="color:${role.color}">${role.icon} ${role.label}</div>
        <div class="songs-editor-tags" id="tags-${rid}">
          ${songs.map((s, i) => `
            <span class="song-tag">
              ${s}
              <button class="song-tag-remove" data-role="${rid}" data-idx="${i}">✕</button>
            </span>`).join('')}
        </div>
        <div class="song-add-row">
          <input class="form-input" id="song-input-${rid}" type="text"
                 placeholder="Song title…" autocomplete="off" />
          <button class="btn-add-song" data-role="${rid}">+ Add</button>
        </div>
      </div>`;
  }).join('');

  editor.querySelectorAll('.song-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editSongs[btn.dataset.role].splice(parseInt(btn.dataset.idx), 1);
      renderSongsEditor();
    });
  });

  editor.querySelectorAll('.btn-add-song').forEach(btn => {
    btn.addEventListener('click', () => addSongFromInput(btn.dataset.role));
  });

  editor.querySelectorAll('input[id^="song-input-"]').forEach(input => {
    const rid = input.id.replace('song-input-', '');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addSongFromInput(rid); }
    });
  });
}

function addSongFromInput(rid) {
  const input = document.getElementById(`song-input-${rid}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!state.editSongs[rid]) state.editSongs[rid] = [];
  if (!state.editSongs[rid].includes(val)) state.editSongs[rid].push(val);
  input.value = '';
  renderSongsEditor();
  setTimeout(() => { const el = document.getElementById(`song-input-${rid}`); if (el) el.focus(); }, 50);
}

async function saveEdit() {
  const nameInput = document.getElementById('edit-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); toast('Please enter your name', 'error'); return; }
  if (state.editRoles.length === 0) { toast('Select at least one role', 'error'); return; }

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const existing = musicians.find(m => m.id === state.editingId);
  const colorIdx = existing ? existing.colorIdx : musicians.length % AVATAR_COLORS.length;

  const payload = {
    name,
    colorIdx,
    roles: state.editRoles,
    songs: Object.fromEntries(state.editRoles.map(rid => [rid, state.editSongs[rid] || []])),
  };

  try {
    let saved;
    if (state.editingId) {
      saved = await apiFetch(`${API}/${state.editingId}`, {
        method: 'PUT',
        body:   JSON.stringify(payload),
      });
      musicians = musicians.map(m => m.id === saved.id ? saved : m);
      toast('Profile updated!', 'success');
    } else {
      saved = await apiFetch(API, {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      musicians.push(saved);
      toast(`${saved.name} added to the session 🎸`, 'success');
    }
    closeModal();
    renderMusicians();
  } catch (err) {
    toast(err.message, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Member';
  }
}

// ===== MODAL HELPERS =====
function setModalContent(html) { document.getElementById('modal-content').innerHTML = html; }

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  state.editingId = null;
}

// ===== TOAST =====
function toast(msg, type = 'success') {
  const icon = type === 'success' ? '✅' : '⚠️';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===== INIT =====
async function init() {
  renderFilterChips();

  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value;
    renderMusicians();
  });

  document.getElementById('add-member-btn').addEventListener('click', openAddModal);

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  try {
    await loadMusicians();
  } catch (err) {
    console.error(err);
    document.getElementById('musicians-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Could not connect to server</div>
        <p class="empty-desc">Make sure the server is running: <code>node server.js</code></p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
