// ===== ROLE DEFINITIONS =====
const ROLES = [
  { id: 'singer',     label: 'Vocals',     icon: '🎤', color: '#f56bab' },
  { id: 'guitarist',  label: 'Guitar',     icon: '🎸', color: '#5b8cff' },
  { id: 'bassist',    label: 'Bass',       icon: '🎵', color: '#9b72f5' },
  { id: 'drummer',    label: 'Drums',      icon: '🥁', color: '#f5a623' },
  { id: 'keys',       label: 'Keys',       icon: '🎹', color: '#3ecf8e' },
  { id: 'harmonica',  label: 'Harmonica',  icon: '🎼', color: '#56cfe1' },
  { id: 'violinist',  label: 'Violin',     icon: '🎻', color: '#e56bab' },
  { id: 'flutist',    label: 'Flute',      icon: '🪈', color: '#ffd166' },
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
  view:      'members',  // 'members' | 'songbook'
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
      return Object.keys(m.songs).some(s => s.toLowerCase().includes(q));
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
  // Dispatch to the correct view
  if (state.view === 'songbook') { renderSongbook(); return; }

  const grid = document.getElementById('musicians-grid');
  const list = getFilteredMusicians();
  const total = musicians.length;

  document.querySelector('.section-count').textContent =
    list.length === total
      ? ` ${total} Member${total !== 1 ? 's' : ''}`
      : ` ${list.length} of ${total}`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🎼</div>
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

// ===== SONGBOOK =====

/**
 * Aggregates all unique songs from all musicians into a map:
 * { songTitle -> { roleId -> [musicianName, ...] } }
 */
function buildSongbook() {
  const q = state.search.toLowerCase().trim();
  const book = {};
  for (const m of musicians) {
    for (const [title, rids] of Object.entries(m.songs)) {
      if (q && !title.toLowerCase().includes(q)) continue;
      if (!book[title]) book[title] = {};
      for (const rid of rids) {
        if (!book[title][rid]) book[title][rid] = [];
        book[title][rid].push(m.name);
      }
    }
  }
  return book;
}

function renderSongbook() {
  const container = document.getElementById('songbook-grid');
  const book = buildSongbook();
  const titles = Object.keys(book).sort((a, b) => a.localeCompare(b));

  // Section count shows number of unique songs
  document.querySelector('.section-count').textContent =
    ` ${titles.length} Song${titles.length !== 1 ? 's' : ''}`;

  if (titles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎼</div>
        <div class="empty-title">No songs found</div>
        <p class="empty-desc">Add songs to your profile to see them here!</p>
      </div>`;
    return;
  }

  container.innerHTML = titles.map(title => {
    const roleMap = book[title]; // { roleId -> [names] }
    const roleIds = Object.keys(roleMap);
    const totalPlayers = new Set(Object.values(roleMap).flat()).size;

    const iconBadges = roleIds.map(rid => {
      const role = ROLE_MAP[rid];
      if (!role) return '';
      return `<span class="song-row-icon-badge"
        style="color:${role.color};border-color:${role.color}55;background:${role.color}14">
        ${role.icon} ${role.label}
      </span>`;
    }).join('');

    return `
      <div class="song-row" data-song="${encodeURIComponent(title)}">
        <div>
          <div class="song-row-title">${title}</div>
          <div class="song-row-meta">${totalPlayers} musician${totalPlayers !== 1 ? 's' : ''} · ${roleIds.length} instrument${roleIds.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="song-row-icons">${iconBadges}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', () => {
      const title = decodeURIComponent(row.dataset.song);
      openInstantBandModal(title, book[title]);
    });
  });
}

function openInstantBandModal(title, roleMap) {
  // Build the "Instant Band" breakdown — all ROLES in order, show who can play each
  const sectionsHtml = ROLES.map(role => {
    const names = roleMap[role.id] || [];
    const badgesHtml = names.length > 0
      ? names.map(name => `
          <span class="instant-band-badge"
            style="color:${role.color};border-color:${role.color}55;background:${role.color}14">
            ${role.icon} ${name}
          </span>`).join('')
      : `<span class="instant-band-missing">⚠️ No one registered yet</span>`;

    // Only show roles that are represented OR are missing but someone might fill
    if (names.length === 0 && !roleMap[role.id]) return '';

    return `
      <div class="instant-band-section">
        <div class="instant-band-label" style="color:${role.color}">${role.icon} ${role.label}</div>
        <div class="instant-band-badges">${badgesHtml}</div>
      </div>`;
  }).join('');

  setModalContent(`
    <div class="modal-header">
      <div>
        <div class="modal-title">🎵 ${title}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem">Instant Band</div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div style="padding:0 0.25rem">
      ${sectionsHtml}
    </div>
    <div style="margin-top:1.5rem;text-align:right">
      <button class="btn btn-secondary" id="modal-close-btn2">Close</button>
    </div>
  `);

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn2').addEventListener('click', closeModal);
  openModal();
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

  const songKeys = Object.keys(m.songs);
  const displaySongs = songKeys.slice(0, 5);
  const extra = songKeys.length - 5;
  
  let songsHtml = '';
  if (songKeys.length === 0) {
    songsHtml = '<div class="no-songs" style="margin-top:0.5rem">No songs added yet</div>';
  } else {
    songsHtml = '<div class="songs-list" style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.3rem">';
    songsHtml += displaySongs.map(title => {
      const rids = m.songs[title] || [];
      const icons = rids.map(rid => ROLE_MAP[rid]?.icon).filter(Boolean).join(' ');
      return `<div class="song-item" style="display:flex;justify-content:space-between;background:var(--bg-tertiary);padding:0.4rem 0.6rem;border-radius:4px;font-size:0.85rem">
        <span class="song-title">${formatSongTitle(title)}</span> 
        <span class="song-icons" style="letter-spacing:2px">${icons}</span>
      </div>`;
    }).join('');
    if (extra > 0) {
      songsHtml += `<div class="song-item" style="color:var(--text-muted);font-style:italic;font-size:0.8rem;text-align:center;padding-top:0.3rem">+${extra} more</div>`;
    }
    songsHtml += '</div>';
  }

  const songCount = songKeys.length;

  return `
    <div class="musician-card" data-id="${m.id}" data-name="${m.name}"
         style="--accent-color:${accentColor}22">
      <div class="card-header">
        <div class="avatar" style="background:${accentColor}22;color:${accentColor}">
          ${getInitials(m.name)}
        </div>
        <div>
          <div class="card-name">${m.name}</div>
          <div class="card-meta">${songCount} song${songCount !== 1 ? 's' : ''} · ${m.roles.length} instrument${m.roles.length !== 1 ? 's' : ''}</div>
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

  const songKeys = Object.keys(m.songs);
  
  let songsHtml = '';
  if (songKeys.length === 0) {
    songsHtml = '<div class="no-songs" style="padding:1rem 0;text-align:center">No songs listed yet</div>';
  } else {
    songsHtml = '<div class="detail-songs-list" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem">';
    songsHtml += songKeys.map(title => {
      const rids = m.songs[title] || [];
      const roleBadges = rids.map(rid => {
        const role = ROLE_MAP[rid];
        if (!role) return '';
        return `<span class="inline-role-badge" style="color:${role.color};border:1px solid ${role.color}44;background:${role.color}11;padding:0.15rem 0.4rem;border-radius:12px;font-size:0.75rem;font-weight:600;display:inline-flex;align-items:center;gap:0.25rem" title="Instrument">${role.icon} ${role.label}</span>`;
      }).join('');
      return `<div class="detail-song-row" style="background:var(--bg-tertiary);padding:0.75rem;border-radius:6px;display:flex;flex-direction:column;gap:0.4rem">
        <div class="ds-title" style="font-weight:600;font-size:1.05rem;color:var(--text-primary)">${formatSongTitle(title)}</div>
        <div class="ds-roles" style="display:flex;flex-wrap:wrap;gap:0.4rem">${roleBadges}</div>
      </div>`;
    }).join('');
    songsHtml += '</div>';
  }

  const songCount = songKeys.length;

  setModalContent(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div class="avatar" style="background:${accentColor}22;color:${accentColor}">
          ${getInitials(m.name)}
        </div>
        <div>
          <div class="modal-title">${m.name}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.1rem">
            ${songCount} song${songCount !== 1 ? 's' : ''} · ${m.roles.length} instrument${m.roles.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="detail-roles">${songsHtml}</div>
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
  state.editRoles = [];
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
      <label class="form-label">Instruments</label>
      <div class="roles-grid" id="roles-grid"></div>
    </div>

    <div class="form-group" id="songs-section" style="display:none">
      <label class="form-label">Songs</label>
      <div class="songs-editor" id="songs-editor"></div>
    </div>

    <div class="form-actions">
      <button class="btn btn-secondary" id="modal-close-btn2">Cancel</button>
      <button class="btn btn-primary" id="modal-save-btn">Save</button>
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

  section.style.display = '';

  const inputEl = document.getElementById('song-input-new');
  const currentVal = inputEl ? inputEl.value : '';

  const songs = Object.keys(state.editSongs);
  
    let html = `<div class="song-add-row" style="margin-bottom:1rem;display:flex;gap:0.5rem;position:relative">
    <div style="flex:1;position:relative">
      <input class="form-input" id="song-input-new" type="text" placeholder="Add a song you play..." autocomplete="off" style="width:100%" />
      <div id="autocomplete-dropdown" class="autocomplete-dropdown hidden"></div>
    </div>
    <button class="btn btn-secondary" id="btn-add-song-new" style="white-space:nowrap">+ Add</button>
  </div>`;
  
  if (songs.length === 0) {
    html += `<div class="no-songs" style="text-align:center;padding:1rem 0;color:var(--text-muted)">No songs added yet.</div>`;
  } else {
    html += `<div class="songs-editor-list" style="display:flex;flex-direction:column;gap:0.5rem">`;
    songs.forEach(title => {
      const rids = state.editSongs[title] || [];
      
      const roleBadges = rids.map(rid => {
        const role = ROLE_MAP[rid];
        if (!role) return '';
        return `<span class="mini-role-badge" data-title="${title}" data-role="${rid}" style="background:${role.color};color:#fff;border-radius:4px;padding:0.15rem 0.4rem;font-size:0.75rem;cursor:pointer;display:inline-flex;align-items:center;gap:0.3rem" title="Remove role">${role.icon} ${role.label} <span style="font-size:0.6rem;opacity:0.7">✕</span></span>`;
      }).join('');
      
      const availableRoles = ROLES.map(r => r.id).filter(rid => !rids.includes(rid));
      const addSelectHtml = availableRoles.length > 0 ? `
        <select class="song-role-select" data-title="${title}" style="background:transparent;border:1px dashed var(--text-muted);color:var(--text-primary);border-radius:4px;padding:0.1rem 0.3rem;font-size:0.75rem;cursor:pointer;outline:none">
          <option value="">+ Add Instrument</option>
          ${availableRoles.map(r => `<option value="${r}">${ROLE_MAP[r].label}</option>`).join('')}
        </select>
      ` : '';
      
      html += `
        <div class="songs-editor-block" style="background:var(--bg-tertiary);padding:0.75rem;border-radius:6px;display:flex;flex-direction:column;gap:0.5rem;position:relative">
          <button type="button" class="song-tag-remove" data-title="${title}" style="position:absolute;top:0.5rem;right:0.5rem;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background 0.2s">✕</button>
          ${formatSongTitle(title)}
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:-0.2rem">Instruments I play on this song:</div>
          <div class="song-role-toggles" style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center">
            ${roleBadges}
            ${addSelectHtml}
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  
  editor.innerHTML = html;

  const newInputEl = document.getElementById('song-input-new');
  if (newInputEl) {
    newInputEl.value = currentVal;
    if (currentVal) newInputEl.focus();
  }

  editor.querySelectorAll('.song-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      delete state.editSongs[btn.dataset.title];
      renderSongsEditor();
    });
  });

  editor.querySelectorAll('.mini-role-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const title = badge.dataset.title;
      const rid = badge.dataset.role;
      state.editSongs[title] = state.editSongs[title].filter(r => r !== rid);
      renderSongsEditor();
    });
  });

  editor.querySelectorAll('.song-role-select').forEach(select => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      const title = select.dataset.title;
      const rid = select.value;
      if (!state.editSongs[title]) state.editSongs[title] = [];
      if (!state.editSongs[title].includes(rid)) {
        state.editSongs[title].push(rid);
      }
      renderSongsEditor();
    });
  });

  const addBtn = document.getElementById('btn-add-song-new');
  if (addBtn) addBtn.addEventListener('click', () => {
    document.getElementById('autocomplete-dropdown').classList.add('hidden');
    addSongFromInput();
  });

  const input = document.getElementById('song-input-new');
  const dropdown = document.getElementById('autocomplete-dropdown');
  
  if (input && dropdown) {
    let debounceTimer;
    
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dropdown.classList.add('hidden');
        addSongFromInput();
      }
    });

    input.addEventListener('input', e => {
      const query = e.target.value.trim();
      if (query.length < 3) {
        dropdown.classList.add('hidden');
        return;
      }

      clearTimeout(debounceTimer);
      dropdown.classList.remove('hidden');
      dropdown.innerHTML = `<div class="autocomplete-loading">Searching iTunes...</div>`;

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=6`);
          const data = await res.json();
          
          if (data.results.length === 0) {
            dropdown.innerHTML = `<div class="autocomplete-loading">No official matches found. Press Add to use your spelling.</div>`;
            return;
          }

          dropdown.innerHTML = data.results.map(track => {
            const rawTitle = `${track.artistName} - ${track.trackName}`;
            const safeTitle = rawTitle.replace(/"/g, '&quot;');
            return `
            <div class="autocomplete-item" data-title="${safeTitle}">
              <img src="${track.artworkUrl60}" class="autocomplete-art" alt="Album art" />
              <div class="autocomplete-text">
                <div class="autocomplete-title">${track.trackName}</div>
                <div class="autocomplete-artist">${track.artistName}</div>
              </div>
            </div>
          `}).join('');

          dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
              input.value = item.dataset.title;
              dropdown.classList.add('hidden');
              input.focus();
            });
          });
        } catch (err) {
          dropdown.innerHTML = `<div class="autocomplete-loading">Error fetching suggestions</div>`;
        }
      }, 400); // 400ms debounce
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }
}

function addSongFromInput() {
  const input = document.getElementById('song-input-new');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  
  if (state.editRoles.length === 0) {
    toast('Please select at least one instrument for this song first.', 'error');
    return;
  }
  
  if (!state.editSongs[val]) {
    state.editSongs[val] = [...state.editRoles];
  }
  
  // Clear selected instruments after adding the song
  state.editRoles = [];
  
  input.value = '';
  renderRolesGrid();
  renderSongsEditor();
  setTimeout(() => { const el = document.getElementById('song-input-new'); if (el) el.focus(); }, 50);
}

async function saveEdit() {
  const nameInput = document.getElementById('edit-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); toast('Please enter your name', 'error'); return; }

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const existing = musicians.find(m => m.id === state.editingId);
  const colorIdx = existing ? existing.colorIdx : musicians.length % AVATAR_COLORS.length;

  const finalSongs = {};
  const allSongRids = new Set();
  
  for (const [title, rids] of Object.entries(state.editSongs)) {
    if (rids.length === 0) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      toast(`Please add an instrument to the song "${title}", or remove it.`, 'error');
      return;
    }
    finalSongs[title] = rids;
    rids.forEach(r => allSongRids.add(r));
  }

  const finalRoles = Array.from(new Set([...state.editRoles, ...allSongRids]));
  
  if (finalRoles.length === 0) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
    toast('Select at least one instrument', 'error'); 
    return;
  }

  const payload = {
    name,
    colorIdx,
    roles: finalRoles,
    songs: finalSongs,
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

// Helper to format "Artist - Title" strings beautifully
function formatSongTitle(rawTitle) {
  if (!rawTitle.includes(' - ')) {
    return `<span class="song-title" style="font-weight:500;color:var(--text-primary)">${rawTitle}</span>`;
  }
  const [artist, ...titleParts] = rawTitle.split(' - ');
  const title = titleParts.join(' - ');
  return `
    <div style="display:flex;flex-direction:column;line-height:1.1">
      <span class="song-title" style="font-weight:600;color:var(--text-primary)">${title}</span>
      <span class="song-artist" style="font-size:0.7rem;color:var(--text-muted)">${artist}</span>
    </div>
  `;
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

  // ── View toggle (Members ↔ Songbook) ────────────────────────────────────
  function switchView(view) {
    state.view = view;
    const membersGrid  = document.getElementById('musicians-grid');
    const songbookGrid = document.getElementById('songbook-grid');
    const filterBar    = document.getElementById('filter-bar');
    const btnMembers   = document.getElementById('toggle-members');
    const btnSongbook  = document.getElementById('toggle-songbook');
    const searchInput  = document.getElementById('search-input');

    if (view === 'members') {
      membersGrid.classList.remove('hidden');
      songbookGrid.classList.add('hidden');
      filterBar.classList.remove('hidden');
      btnMembers.classList.add('active');
      btnSongbook.classList.remove('active');
      searchInput.placeholder = 'Search musician or song…';
    } else {
      membersGrid.classList.add('hidden');
      songbookGrid.classList.remove('hidden');
      filterBar.classList.add('hidden');
      btnSongbook.classList.add('active');
      btnMembers.classList.remove('active');
      searchInput.placeholder = 'Search songs…';
    }
    renderMusicians();
  }

  document.getElementById('toggle-members').addEventListener('click', () => switchView('members'));
  document.getElementById('toggle-songbook').addEventListener('click', () => switchView('songbook'));

  try {
    await loadMusicians();
  } catch (err) {
    console.error(err);
    document.getElementById('musicians-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Could not connect to server</div>
        <p class="empty-desc">Make sure the server is running: <code>python main.py</code></p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
