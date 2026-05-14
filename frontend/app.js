// ===== ROLE DEFINITIONS =====
const INSTRUMENT_ICONS = {
  harmonica: `
    <svg class="instrument-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="8" width="18" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M5 11h14M5 14h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8 8v8M12 8v8M16 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
  ukulele: `
    <svg class="instrument-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 6.5l5-5 2 2-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M12.2 7.8c1.7-1.2 4-.7 5.1 1 1 1.6.5 3.7-1 4.8.6 1.8-.1 3.9-1.8 5-2.2 1.5-5.4.6-7.2-2.1-1.8-2.7-1.6-6 .6-7.5 1.3-.9 3-.8 4.3.1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="12.3" cy="13.2" r="1.7" fill="currentColor"/>
      <path d="M9.2 16.2l5.9-5.9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
};

const ROLES = [
  { id: 'singer',     label: 'Vocals',     icon: '🎤', color: '#f56bab' },
  { id: 'guitarist',  label: 'Guitar',     icon: '🎸', color: '#5b8cff' },
  { id: 'bassist',    label: 'Bass',       icon: '🎵', color: '#9b72f5' },
  { id: 'drummer',    label: 'Drums',      icon: '🥁', color: '#f5a623' },
  { id: 'keys',       label: 'Keys',       icon: '🎹', color: '#3ecf8e' },
  { id: 'accordion',  label: 'Accordion',  icon: '🪗', color: '#d90429' },
  { id: 'banjo',      label: 'Banjo',      icon: '🪕', color: '#ffb703' },
  { id: 'cello',      label: 'Cello',      icon: '🎻', color: '#c44536' },
  { id: 'flutist',    label: 'Flute',      icon: '🪈', color: '#ffd166' },
  { id: 'harmonica',  label: 'Harmonica',  icon: INSTRUMENT_ICONS.harmonica, color: '#56cfe1' },
  { id: 'horn',       label: 'Horn',       icon: '🎺', color: '#ef476f' },
  { id: 'percussion', label: 'Percussion', icon: '🪘', color: '#8b5a2b' },
  { id: 'saxophone',  label: 'Saxophone',  icon: '🎷', color: '#fca311' },
  { id: 'synth',      label: 'Synth/DJ',   icon: '🎛️', color: '#00f5d4' },
  { id: 'ukulele',    label: 'Ukulele',    icon: INSTRUMENT_ICONS.ukulele, color: '#06d6a0' },
  { id: 'violinist',  label: 'Violin',     icon: '🎻', color: '#e56bab' },
  { id: 'other',      label: 'Other',      icon: '🎼', color: '#8fa3ff' },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));

const API = '/api/members';

// ===== STATE =====
let members = [];   // in-memory cache from server
let state = {
  view:      'members',  // 'members' | 'songbook'
  filters:   [],
  customFilter: 'all',
  search:    '',
  modalMode: null,
  editingId: null,
  editRoles: [],
  editSongs: {},
  pendingSongTitle: '',
  pendingSongRoles: [],
  pendingOtherInstrument: '',
  otherDropdownOpen: false,
};
let modalBackStack = [];

// ===== API HELPERS =====
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : { detail: await res.text() };
  if (!res.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

async function loadMembers() {
  showGridLoading();
  members = await apiFetch(API);
  renderMembers();
}

// ===== UTILS =====
function getInitials(name) {
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function encodeDataValue(value) {
  return encodeURIComponent(String(value ?? ''));
}

function decodeDataValue(value) {
  return decodeURIComponent(value || '');
}

function normaliseSearch(value) {
  return stripAccents(value)
    .toLowerCase()
    .trim();
}

function stripAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const REMASTER_EDITION_RE = /\s*(?:[\(\[]\s*(?:(?:\d{2,4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{2,4})?(?:\s+version)?|remaster(?:ed)?\s+version)\s*[\)\]]|[-–—]\s*(?:(?:\d{2,4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{2,4})?(?:\s+version)?|remaster(?:ed)?\s+version))\s*$/i;
const CONTRACTION_RE = /\b([A-Za-z]+)'(S|T|RE|VE|LL|D|M)\b/g;

function titlePreservingContractions(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b\w/g, ch => ch.toUpperCase())
    .replace(CONTRACTION_RE, (_, word, suffix) => `${word}'${suffix.toLowerCase()}`);
}

function removeSongEditionSuffix(value) {
  let previous = String(value ?? '').trim();
  while (true) {
    const normalized = previous.replace(REMASTER_EDITION_RE, '').trim();
    if (normalized === previous) return normalized;
    previous = normalized;
  }
}

function splitSongKey(value) {
  const text = String(value ?? '');
  const match = text.match(/\s+-\s+/);
  if (!match) return [text];
  const index = match.index;
  return [
    text.slice(0, index),
    text.slice(index + match[0].length),
  ];
}

function normalizeSongKey(value) {
  const normalizedKey = removeSongEditionSuffix(value);
  if (!normalizedKey.replace(/[-–—\s]/g, '')) return '';
  return splitSongKey(normalizedKey)
    .map(part => titlePreservingContractions(removeSongEditionSuffix(part)))
    .filter(Boolean)
    .join(' - ');
}

const CUSTOM_ROLE_PREFIX = 'other:';

function normalizeInstrumentName(value) {
  return stripAccents(value)
    .trim()
    .split(/\s+/)
    .map(titlePreservingContractions)
    .join(' ');
}

function makeCustomRoleId(value) {
  const label = normalizeInstrumentName(value);
  return label ? `${CUSTOM_ROLE_PREFIX}${label}` : '';
}

function isCustomRole(roleId) {
  return String(roleId ?? '').startsWith(CUSTOM_ROLE_PREFIX);
}

function getRole(roleId) {
  if (ROLE_MAP[roleId]) return ROLE_MAP[roleId];
  if (isCustomRole(roleId)) {
    const label = roleId.slice(CUSTOM_ROLE_PREFIX.length);
    return { id: roleId, label, icon: '🎼', color: ROLE_MAP.other.color };
  }
  return null;
}

function getOrderedRoleIds(roleMap) {
  const ids = Object.keys(roleMap);
  const standardIds = ROLES
    .map(role => role.id)
    .filter(id => id !== 'other' && ids.includes(id));
  const customIds = ids
    .filter(isCustomRole)
    .sort((a, b) => getRole(a).label.localeCompare(getRole(b).label));
  const fallbackIds = ids.includes('other') ? ['other'] : [];
  const unknownIds = ids
    .filter(id => !standardIds.includes(id) && !customIds.includes(id) && id !== 'other')
    .sort((a, b) => a.localeCompare(b));
  return [...standardIds, ...customIds, ...fallbackIds, ...unknownIds];
}

function getCustomRoleOptions(sourceMembers = members) {
  const ids = new Set();
  for (const member of sourceMembers) {
    for (const rid of member.roles || []) {
      if (isCustomRole(rid)) ids.add(rid);
    }
    for (const rids of Object.values(member.songs || {})) {
      for (const rid of rids || []) {
        if (isCustomRole(rid)) ids.add(rid);
      }
    }
  }
  return Array.from(ids)
    .sort((a, b) => getRole(a).label.localeCompare(getRole(b).label));
}

function memberMatchesRoleFilter(member, filter, customFilter = 'all') {
  const roles = member.roles || [];
  if (filter === 'all') return true;
  if (filter === 'other') {
    if (customFilter !== 'all') return roles.includes(customFilter);
    return roles.some(isCustomRole) || roles.includes('other');
  }
  return roles.includes(filter);
}

function memberMatchesRoleFilters(member, filters = [], customFilter = 'all') {
  if (!filters.length) return true;
  return filters.some(filter => memberMatchesRoleFilter(member, filter, customFilter));
}

function buildSelectedSongRoles(pendingRoles, pendingOtherInstrument) {
  const selected = [];
  for (const rid of pendingRoles) {
    if (rid !== 'other' && !selected.includes(rid)) selected.push(rid);
  }

  const customRole = makeCustomRoleId(pendingOtherInstrument);
  if (customRole && !selected.includes(customRole)) selected.push(customRole);

  return selected;
}

// ===== FILTER =====
function getFilteredMembers() {
  let list = members;
  const q = normaliseSearch(state.search);
  if (q) {
    list = list.filter(m => {
      if (normaliseSearch(m.name).includes(q)) return true;
      return Object.keys(m.songs).some(s => normaliseSearch(s).includes(q));
    });
  }
  if (state.filters.length > 0) {
    list = list.filter(m => memberMatchesRoleFilters(m, state.filters, state.customFilter));
  }
  return list;
}

// ===== RENDER =====
function showGridLoading() {
  const grid = document.getElementById('members-grid');
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon" style="animation:pulse 1.2s ease infinite">🎼</div>
      <div class="empty-title">Loading the crew…</div>
    </div>`;
}

function renderMembers() {
  // Dispatch to the correct view
  if (state.view === 'songbook') { renderSongbook(); return; }
  if (state.view === 'bandbook') { renderBandbook(); return; }

  const grid = document.getElementById('members-grid');
  const list = getFilteredMembers();
  const total = members.length;

  document.querySelector('.section-count').textContent =
    list.length === total
      ? ` ${total} ${total === 1 ? 'member' : 'members'}`
      : ` ${list.length} of ${total}`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🎼</div>
        <div class="empty-title">No members found</div>
        <p class="empty-desc">Try a different search or be the first to join!</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(m => renderCard(m)).join('');

  grid.querySelectorAll('.member-card').forEach(card => {
    const openCardProfile = () => {
      openViewModal(card.dataset.id, {
        historyTarget: { type: 'closeModal' },
      });
    };

    card.addEventListener('click', openCardProfile);
    card.addEventListener('keydown', e => {
      if (shouldOpenCardFromKey(e)) {
        e.preventDefault();
        openCardProfile();
      }
    });
    card.querySelector('.btn-view').addEventListener('click', e => {
      e.stopPropagation();
      openCardProfile();
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
        members = members.filter(m => m.id !== card.dataset.id);
        renderMembers();
        toast('Removed from members', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function shouldOpenCardFromKey(event) {
  return event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ');
}

// ===== SONGBOOK =====

/**
 * Aggregates all unique songs from all members into a map:
 * { songTitle -> { roleId -> [memberName, ...] } }
 */
function buildSongbookFrom(sourceMembers, search = '') {
  const q = normaliseSearch(search);
  const book = {};
  for (const m of sourceMembers) {
    const memberName = String(m.name ?? 'Unknown');
    for (const [title, rids] of Object.entries(m.songs || {})) {
      const roleIds = Array.isArray(rids) ? rids : [];
      if (roleIds.length === 0) continue;
      const matchesTitle = normaliseSearch(title).includes(q);
      const matchesMember = normaliseSearch(memberName).includes(q);
      
      if (q && !matchesTitle && !matchesMember) continue;
      
      if (!book[title]) book[title] = {};
      for (const rid of roleIds) {
        if (!book[title][rid]) book[title][rid] = [];
        if (!book[title][rid].includes(memberName)) {
          book[title][rid].push(memberName);
        }
      }
    }
  }
  return book;
}

function buildSongbook() {
  return buildSongbookFrom(members, state.search);
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
    const roleIds = getOrderedRoleIds(roleMap);
    const totalPlayers = new Set(Object.values(roleMap).flat()).size;
    const safeTitle = escapeHtml(title);

    const iconBadges = roleIds.map(rid => {
      const role = getRole(rid);
      if (!role) return '';
      return `<span class="song-row-icon-badge"
        style="color:${role.color};border-color:${role.color}55;background:${role.color}14">
        ${role.icon} ${escapeHtml(role.label)}
      </span>`;
    }).join('');

    return `
      <div class="song-row" data-song="${encodeDataValue(title)}">
        <div>
          <div class="song-row-title">${safeTitle}</div>
          <div class="song-row-meta">${totalPlayers} member${totalPlayers !== 1 ? 's' : ''} · ${roleIds.length} instrument${roleIds.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="song-row-icons">${iconBadges}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', () => {
      const title = decodeDataValue(row.dataset.song);
      openInstantBandModal(title, book[title], {
        historyTarget: { type: 'closeModal' },
      });
    });
  });
}

function openInstantBandModal(title, roleMap, options = {}) {
  if (options.historyTarget) pushModalHistory(options.historyTarget);

  const safeTitle = escapeHtml(title);
  const sectionsHtml = getOrderedRoleIds(roleMap).map(rid => {
    const role = getRole(rid);
    if (!role) return '';
    const names = roleMap[rid] || [];
    const badgesHtml = names.length > 0
      ? names.map(name => `
          <span class="instant-band-badge clickable-member" data-member="${encodeDataValue(name)}"
            style="color:${role.color};border-color:${role.color}55;background:${role.color}14;cursor:pointer;transition:transform 0.1s"
            onmouseover="this.style.transform='scale(1.05)'"
            onmouseout="this.style.transform='scale(1)'"
            title="View ${escapeAttr(name)}'s profile">
            ${role.icon} ${escapeHtml(name)}
          </span>`).join('')
      : `<span class="instant-band-missing">⚠️ No one registered yet</span>`;

    return `
      <div class="instant-band-section">
        <div class="instant-band-label" style="color:${role.color}">${role.icon} ${escapeHtml(role.label)}</div>
        <div class="instant-band-badges">${badgesHtml}</div>
      </div>`;
  }).join('');

  setModalContent(`
    <div class="modal-header">
      <div>
        <div class="modal-title">🎵 ${safeTitle}</div>
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
  
  // Route to the specific member's profile without changing the active view.
  document.querySelectorAll('.clickable-member').forEach(el => {
    el.addEventListener('click', () => {
      const mName = decodeDataValue(el.dataset.member);
      openMemberProfileByName(mName, {
        backTarget: { type: 'instantBand', title, roleMap },
      });
    });
  });
  
  openModal();
}

// ── Bandbook ────────────────────────────────────────────────────────────────
function buildBandbookFrom(sourceMembers) {
  const bands = {};
  sourceMembers.forEach(m => {
    const memberName = String(m.name ?? 'Unknown');
    for (const [title, roles] of Object.entries(m.songs || {})) {
      const roleIds = Array.isArray(roles) ? roles : [];
      if (roleIds.length === 0) continue;
      let bandName = "Originals / Unknown";
      let songName = title;
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        bandName = parts[0];
        songName = parts.slice(1).join(' - ');
      }
      
      if (!bands[bandName]) bands[bandName] = {};
      if (!bands[bandName][songName]) bands[bandName][songName] = {};
      
      roleIds.forEach(rid => {
        if (!bands[bandName][songName][rid]) bands[bandName][songName][rid] = [];
        if (!bands[bandName][songName][rid].includes(memberName)) {
          bands[bandName][songName][rid].push(memberName);
        }
      });
    }
  });
  return bands;
}

function buildBandbook() {
  return buildBandbookFrom(members);
}

function renderBandbook() {
  const container = document.getElementById('bandbook-grid');
  if (!container) return;

  const bandbook = buildBandbook();
  let bandNames = Object.keys(bandbook).sort((a, b) => a.localeCompare(b));

  const q = normaliseSearch(state.search);
  if (q) {
    bandNames = bandNames.filter(b => {
      const matchesBandName = normaliseSearch(b).includes(q);
      const matchesSong = Object.keys(bandbook[b]).some(s => normaliseSearch(s).includes(q));
      
      // Check if any member in this band matches the search query
      const matchesMember = Object.values(bandbook[b]).some(songRoles => {
        return Object.values(songRoles).some(players => {
          return players.some(p => normaliseSearch(p).includes(q));
        });
      });
      
      return matchesBandName || matchesSong || matchesMember;
    });
  }

  if (bandNames.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🤘</div>
        <div class="empty-title">No bands found</div>
        <p class="empty-desc">Add songs to your profile to see bands here!</p>
      </div>`;
    return;
  }

  container.innerHTML = bandNames.map(bandName => {
    const songs = bandbook[bandName];
    const songCount = Object.keys(songs).length;
    const allPlayers = new Set();
    Object.values(songs).forEach(roleMap => {
      Object.values(roleMap).flat().forEach(p => allPlayers.add(p));
    });
    const safeBandName = escapeHtml(bandName);
    
    return `
      <div class="song-row" data-band="${encodeDataValue(bandName)}">
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="font-size:1.5rem">🤘</div>
          <div>
            <div class="song-row-title" style="font-size:1.1rem;color:var(--text-primary);font-weight:600">${safeBandName}</div>
            <div class="song-row-meta">${songCount} song${songCount !== 1 ? 's' : ''} · ${allPlayers.size} member${allPlayers.size !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', () => {
      const bandName = decodeDataValue(row.dataset.band);
      openBandModal(bandName, bandbook[bandName], {
        historyTarget: { type: 'closeModal' },
      });
    });
  });
}

function openBandModal(bandName, songsMap, options = {}) {
  if (options.historyTarget) pushModalHistory(options.historyTarget);

  const safeBandName = escapeHtml(bandName);
  const songsHtml = Object.keys(songsMap).sort((a, b) => a.localeCompare(b)).map(songName => {
    const roleMap = songsMap[songName];
    const roleIds = getOrderedRoleIds(roleMap);
    const safeSongName = escapeHtml(songName);
    
    const iconBadges = roleIds.map(rid => {
      const role = getRole(rid);
      if (!role) return '';
      const names = roleMap[rid].join(', ');
      return `<span class="song-row-icon-badge" title="${escapeAttr(names)}"
        style="color:${role.color};border-color:${role.color}55;background:${role.color}14">
        ${role.icon} ${escapeHtml(role.label)} (${roleMap[rid].length})
      </span>`;
    }).join('');

    return `
      <div class="band-modal-song" data-song="${encodeDataValue(songName)}" style="background:var(--bg-tertiary);border-radius:6px;padding:0.75rem;margin-bottom:0.75rem;cursor:pointer;transition:background 0.2s">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.5rem;font-size:1.05rem">${safeSongName} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;float:right">View breakdown →</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">${iconBadges}</div>
      </div>
    `;
  }).join('');

  setModalContent(`
    <div class="modal-header">
      <div>
        <div class="modal-title">🤘 ${safeBandName}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem">Band Repertoire</div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div style="padding:0 0.25rem">
      ${songsHtml}
    </div>
    <div style="margin-top:1.5rem;text-align:right">
      <button class="btn btn-secondary" id="modal-close-btn2">Close</button>
    </div>
  `);

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn2').addEventListener('click', closeModal);
  
  // Attach click listeners to open the Instant Band breakdown
  document.querySelectorAll('.band-modal-song').forEach(el => {
    el.addEventListener('click', () => {
      const sName = decodeDataValue(el.dataset.song);
      const fullTitle = bandName === "Originals / Unknown" ? sName : bandName + " - " + sName;
      openInstantBandModal(fullTitle, songsMap[sName], {
        historyTarget: { type: 'band', bandName, songsMap },
      });
    });
  });
  
  openModal();
}

function renderCard(m) {
  const accentColor = getRole(m.roles[0])?.color || '#5b8cff';
  const safeName = escapeHtml(m.name);

  const rolesHtml = m.roles.map(rid => {
    const role = getRole(rid);
    if (!role) return '';
    return `<span class="role-badge" style="background:${role.color}18;color:${role.color};border:1px solid ${role.color}33">
      ${role.icon} ${escapeHtml(role.label)}
    </span>`;
  }).join('');

  const songKeys = Object.keys(m.songs);
  const displaySongs = songKeys.slice(0, 5);
  const extra = songKeys.length - 5;
  
  let songsHtml = '';
  if (songKeys.length === 0) {
    songsHtml = '<div class="no-songs" style="margin-top:0.5rem">No songs added yet</div>';
  } else {
    songsHtml = '<div class="songs-list member-song-list">';
    songsHtml += displaySongs.map(title => {
      const rids = m.songs[title] || [];
      const icons = rids.map(rid => getRole(rid)?.icon).filter(Boolean).join(' ');
      return `<div class="song-item member-song-item">
        <span class="song-title">${formatSongTitle(title)}</span> 
        <span class="song-icons">${icons}</span>
      </div>`;
    }).join('');
    if (extra > 0) {
      songsHtml += `<div class="song-item" style="color:var(--text-muted);font-style:italic;font-size:0.8rem;text-align:center;padding-top:0.3rem">+${extra} more</div>`;
    }
    songsHtml += '</div>';
  }

  const songCount = songKeys.length;

  return `
    <div class="member-card" data-id="${escapeAttr(m.id)}" data-name="${escapeAttr(m.name)}"
         style="--accent-color:${accentColor}22" role="button" tabindex="0" aria-label="View ${escapeAttr(m.name)} profile">
      <div class="card-header">
        <div class="avatar" style="background:${accentColor}22;color:${accentColor}">
          ${escapeHtml(getInitials(m.name))}
        </div>
        <div>
          <div class="card-name">${safeName}</div>
          <div class="card-meta">${songCount} song${songCount !== 1 ? 's' : ''} · ${m.roles.length} instrument${m.roles.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="roles-list">${rolesHtml}</div>
      <div class="card-songs">${songsHtml}</div>
      <div class="card-footer">
        <button class="btn btn-secondary btn-view" style="flex:1;justify-content:center">👁 View All</button>
        <button class="btn btn-secondary btn-edit" style="flex:1;justify-content:center">✏️ Edit</button>
        <button class="btn btn-danger btn-del" title="Remove from members">🗑</button>
      </div>
    </div>`;
}

function renderFilterChips() {
  const bar = document.getElementById('filter-bar');
  const customOptions = getCustomRoleOptions();
  if (!customOptions.includes(state.customFilter)) {
    state.customFilter = 'all';
  }
  const activeFilters = new Set(state.filters);

  const all = `<button class="chip filter-chip ${activeFilters.size === 0 ? 'active' : ''}" type="button" data-filter="all">🎶 All</button>`;
  const chips = ROLES.map(r => {
    if (r.id === 'other') {
      const isActive = activeFilters.has('other');
      let label = r.label;
      if (isActive && state.customFilter !== 'all') {
        label = getRole(state.customFilter)?.label || r.label;
      }

      const dropdownHtml = (isActive && state.otherDropdownOpen && customOptions.length > 0) ? `
        <div class="other-dropdown-menu">
          <button class="chip custom-filter-chip ${state.customFilter === 'all' ? 'active' : ''}" type="button" data-custom-filter="all">
            🎼 All Other
          </button>
          ${customOptions.map(rid => {
            const role = getRole(rid);
            return `<button class="chip custom-filter-chip ${state.customFilter === rid ? 'active' : ''}" type="button" data-custom-filter="${encodeDataValue(rid)}">
              ${role.icon} ${escapeHtml(role.label)}
            </button>`;
          }).join('')}
        </div>
      ` : '';

      return `
        <div class="other-filter-wrap">
          <button class="chip filter-chip ${isActive ? 'active' : ''}" type="button" data-filter="other">
            <span class="chip-icon">${r.icon}</span>${escapeHtml(label)}
          </button>
          ${dropdownHtml}
        </div>
      `;
    }

    return `
      <button class="chip filter-chip ${activeFilters.has(r.id) ? 'active' : ''}" type="button" data-filter="${r.id}">
        <span class="chip-icon">${r.icon}</span>${escapeHtml(r.label)}
      </button>`;
  }).join('');

  bar.innerHTML = all + chips;
  bar.querySelectorAll('.filter-chip').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      const newFilter = c.dataset.filter;
      if (newFilter === 'all') {
        state.filters = [];
        state.customFilter = 'all';
        state.otherDropdownOpen = false;
      } else if (newFilter === 'other') {
        if (state.filters.includes('other')) {
          state.filters = state.filters.filter(filter => filter !== 'other');
          state.customFilter = 'all';
          state.otherDropdownOpen = false;
        } else {
          state.filters = [...state.filters, 'other'];
          state.otherDropdownOpen = customOptions.length > 0;
        }
      } else {
        state.filters = state.filters.includes(newFilter)
          ? state.filters.filter(filter => filter !== newFilter)
          : [...state.filters, newFilter];
        state.otherDropdownOpen = false;
      }
      renderFilterChips();
      renderMembers();
    });
  });
  bar.querySelectorAll('.custom-filter-chip').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      state.customFilter = c.dataset.customFilter === 'all'
        ? 'all'
        : decodeDataValue(c.dataset.customFilter);
      if (!state.filters.includes('other')) state.filters = [...state.filters, 'other'];
      state.otherDropdownOpen = false;
      renderFilterChips();
      renderMembers();
    });
  });
}

// ===== VIEW MODAL =====
function openViewModal(id, options = {}) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  if (options.historyTarget) pushModalHistory(options.historyTarget);
  const accentColor = getRole(m.roles[0])?.color || '#5b8cff';
  const safeName = escapeHtml(m.name);

  const songKeys = Object.keys(m.songs);
  
  let songsHtml = '';
  if (songKeys.length === 0) {
    songsHtml = '<div class="no-songs" style="padding:1rem 0;text-align:center">No songs listed yet</div>';
  } else {
    songsHtml = '<div class="detail-songs-list" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem">';
    songsHtml += songKeys.map(title => {
      const rids = m.songs[title] || [];
      const roleBadges = rids.map(rid => {
        const role = getRole(rid);
        if (!role) return '';
        return `<span class="inline-role-badge" style="color:${role.color};border:1px solid ${role.color}44;background:${role.color}11;padding:0.15rem 0.4rem;border-radius:12px;font-size:0.75rem;font-weight:600;display:inline-flex;align-items:center;gap:0.25rem" title="Instrument">${role.icon} ${escapeHtml(role.label)}</span>`;
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
          ${escapeHtml(getInitials(m.name))}
        </div>
        <div>
          <div class="modal-title">${safeName}</div>
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

function openMemberProfileByName(name, options = {}) {
  const member = members.find(m => normaliseSearch(m.name) === normaliseSearch(name));
  if (!member) return;
  if (options.backTarget) pushModalHistory(options.backTarget);
  openViewModal(member.id);
}

// ===== ADD / EDIT MODAL =====
function openAddModal() {
  state.editingId = null;
  state.editRoles = [];
  state.editSongs = {};
  state.pendingSongTitle = '';
  state.pendingSongRoles = [];
  state.pendingOtherInstrument = '';
  renderEditModal('Add Member 🎼');
}

function openEditModal(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  state.editingId = id;
  state.editRoles = [...m.roles];
  state.editSongs = JSON.parse(JSON.stringify(m.songs));
  state.pendingSongTitle = '';
  state.pendingSongRoles = [];
  state.pendingOtherInstrument = '';
  renderEditModal(`Edit: ${m.name}`);
  document.getElementById('edit-name').value = m.name;
}

function renderEditModal(title) {
  setModalContent(`
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(title)}</div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>

    <div class="form-group">
      <label class="form-label" for="edit-name">Your Name</label>
      <input id="edit-name" class="form-input" type="text" placeholder="e.g. Carlos" autocomplete="off" />
    </div>

    <div class="form-group" id="songs-section">
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

  renderSongsEditor();
  openModal();
}

function getAvailableSongRoles() {
  const customRoles = new Set();
  for (const rid of state.editRoles) {
    if (isCustomRole(rid)) customRoles.add(rid);
  }
  for (const rids of Object.values(state.editSongs)) {
    rids.filter(isCustomRole).forEach(rid => customRoles.add(rid));
  }
  return [
    ...ROLES.filter(r => r.id !== 'other').map(r => r.id),
    ...Array.from(customRoles).sort((a, b) => getRole(a).label.localeCompare(getRole(b).label)),
  ];
}

function renderPendingSongRoles() {
  const standardHtml = ROLES.filter(r => r.id !== 'other').map(({ id: rid }) => {
    const role = getRole(rid);
    const selected = state.pendingSongRoles.includes(rid);
    return `
      <div class="role-toggle ${selected ? 'selected' : ''}" data-pending-role="${rid}">
        <span class="rt-icon">${role.icon}</span>${escapeHtml(role.label)}
      </div>`;
  }).join('');
  const customHtml = state.pendingSongRoles.filter(isCustomRole).map(rid => {
    const role = getRole(rid);
    return `
      <div class="role-toggle selected" data-pending-custom-role="${encodeDataValue(rid)}" title="Remove custom instrument">
        <span class="rt-icon">${role.icon}</span>${escapeHtml(role.label)} <span style="opacity:0.7">✕</span>
      </div>`;
  }).join('');
  const other = getRole('other');
  const otherHtml = `
    <div class="role-toggle ${state.pendingSongRoles.includes('other') ? 'selected' : ''}" data-pending-role="other">
      <span class="rt-icon">${other.icon}</span>${escapeHtml(other.label)}
    </div>`;
  return standardHtml + customHtml + otherHtml;
}

function bindPendingSongRoleControls() {
  document.querySelectorAll('[data-pending-role]').forEach(el => {
    el.addEventListener('click', () => {
      const rid = el.dataset.pendingRole;
      if (state.pendingSongRoles.includes(rid)) {
        state.pendingSongRoles = state.pendingSongRoles.filter(r => r !== rid);
        if (rid === 'other') state.pendingOtherInstrument = '';
      } else {
        state.pendingSongRoles.push(rid);
      }
      renderSongsEditor();
    });
  });

  document.querySelectorAll('[data-pending-custom-role]').forEach(el => {
    el.addEventListener('click', () => {
      const rid = decodeDataValue(el.dataset.pendingCustomRole);
      state.pendingSongRoles = state.pendingSongRoles.filter(roleId => roleId !== rid);
      renderSongsEditor();
    });
  });

  const addOtherInstrument = () => {
    const input = document.getElementById('pending-other-instrument-input');
    const rid = makeCustomRoleId(input?.value);
    if (!rid) {
      toast('Type the instrument name for Other', 'error');
      input?.focus();
      return;
    }
    if (!state.pendingSongRoles.includes(rid)) state.pendingSongRoles.push(rid);
    state.pendingOtherInstrument = '';
    renderSongsEditor();
    setTimeout(() => document.getElementById('pending-other-instrument-input')?.focus(), 0);
  };

  const otherInput = document.getElementById('pending-other-instrument-input');
  if (otherInput) {
    otherInput.addEventListener('input', e => {
      state.pendingOtherInstrument = e.target.value;
    });
    otherInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOtherInstrument();
      }
    });
  }
  document.getElementById('btn-add-pending-other-instrument')?.addEventListener('click', addOtherInstrument);
}

function renderSongsEditor() {
  const section = document.getElementById('songs-section');
  const editor  = document.getElementById('songs-editor');
  if (!section || !editor) return;

  section.style.display = '';

  const inputEl = document.getElementById('song-input-new');
  const currentVal = inputEl ? inputEl.value : '';
  const songs = Object.keys(state.editSongs);

  const selectedSongHtml = state.pendingSongTitle ? `
    <div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;padding:0.75rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
      <div>
        <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);font-weight:700">Selected song</div>
        <div style="margin-top:0.2rem">${formatSongTitle(state.pendingSongTitle)}</div>
      </div>
      <button type="button" class="btn btn-ghost" id="btn-clear-selected-song">Change</button>
    </div>` : '';

  const pendingRolesHtml = state.pendingSongTitle ? `
    <div style="display:flex;flex-direction:column;gap:0.65rem;margin-top:0.8rem">
      <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600">Select instruments for this song</div>
      <div class="roles-grid" id="pending-song-roles-grid">
        ${renderPendingSongRoles()}
      </div>
      ${state.pendingSongRoles.includes('other') ? `
        <div style="display:flex;gap:0.5rem;align-items:center">
          <input id="pending-other-instrument-input" class="form-input" type="text" placeholder="Type the instrument..." autocomplete="off" style="flex:1" value="${escapeAttr(state.pendingOtherInstrument)}" />
          <button type="button" class="btn btn-secondary" id="btn-add-pending-other-instrument" style="white-space:nowrap">+ Add Instrument</button>
        </div>` : ''}
      <div style="margin-top:0.5rem;display:flex;justify-content:flex-end">
        <button class="btn btn-secondary" id="btn-add-song-new" style="white-space:nowrap">+ Add Song</button>
      </div>
    </div>` : '';

  let html = `<div class="song-add-row">
    <div class="song-add-input-wrap">
      <input class="form-input" id="song-input-new" type="text" placeholder="Search and select a song..." autocomplete="off" style="width:100%" />
      <div id="autocomplete-dropdown" class="autocomplete-dropdown hidden"></div>
    </div>
  </div>
  ${selectedSongHtml}
  ${pendingRolesHtml}`;
  
  if (songs.length === 0) {
    html += `<div class="no-songs" style="text-align:center;padding:1rem 0;color:var(--text-muted)">No songs added yet.</div>`;
  } else {
    html += `<div class="songs-editor-list" style="display:flex;flex-direction:column;gap:0.5rem">`;
    songs.forEach(title => {
      const rids = state.editSongs[title] || [];
      const encodedTitle = encodeDataValue(title);
      
      const roleBadges = rids.map(rid => {
        const role = getRole(rid);
        if (!role) return '';
        return `<span class="mini-role-badge" data-title="${encodedTitle}" data-role="${encodeDataValue(rid)}" style="background:${role.color};color:#fff;border-radius:4px;padding:0.15rem 0.4rem;font-size:0.75rem;cursor:pointer;display:inline-flex;align-items:center;gap:0.3rem" title="Remove role">${role.icon} ${escapeHtml(role.label)} <span style="font-size:0.6rem;opacity:0.7">✕</span></span>`;
      }).join('');
      
      const availableRoles = getAvailableSongRoles().filter(rid => !rids.includes(rid));
      const addSelectHtml = availableRoles.length > 0 ? `
        <select class="song-role-select" data-title="${encodedTitle}" style="background:transparent;border:1px dashed var(--text-muted);color:var(--text-primary);border-radius:4px;padding:0.1rem 0.3rem;font-size:0.75rem;cursor:pointer;outline:none">
          <option value="">+ Add Instrument</option>
          ${availableRoles.map(r => `<option value="${encodeDataValue(r)}">${escapeHtml(getRole(r).label)}</option>`).join('')}
        </select>
      ` : '';
      
      html += `
        <div class="songs-editor-block" style="background:var(--bg-tertiary);padding:0.75rem;border-radius:6px;display:flex;flex-direction:column;gap:0.5rem;position:relative">
          <button type="button" class="song-tag-remove" data-title="${encodedTitle}" style="position:absolute;top:0.5rem;right:0.5rem;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background 0.2s">✕</button>
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
    if (currentVal && !state.pendingSongTitle) newInputEl.focus();
  }

  document.getElementById('btn-clear-selected-song')?.addEventListener('click', () => {
    state.pendingSongTitle = '';
    state.pendingSongRoles = [];
    state.pendingOtherInstrument = '';
    renderSongsEditor();
  });

  editor.querySelectorAll('.song-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      delete state.editSongs[decodeDataValue(btn.dataset.title)];
      renderSongsEditor();
    });
  });

  editor.querySelectorAll('.mini-role-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const title = decodeDataValue(badge.dataset.title);
      const rid = decodeDataValue(badge.dataset.role);
      state.editSongs[title] = state.editSongs[title].filter(r => r !== rid);
      renderSongsEditor();
    });
  });

  editor.querySelectorAll('.song-role-select').forEach(select => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      const title = decodeDataValue(select.dataset.title);
      const rid = decodeDataValue(select.value);
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

  bindPendingSongRoleControls();

  const input = document.getElementById('song-input-new');
  const dropdown = document.getElementById('autocomplete-dropdown');
  
  if (input && dropdown) {
    let debounceTimer;
    
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dropdown.classList.add('hidden');
      }
    });

    input.addEventListener('input', e => {
      const query = e.target.value.trim();
      if (state.pendingSongTitle) {
        state.pendingSongTitle = '';
        state.pendingSongRoles = [];
        state.pendingOtherInstrument = '';
      }
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
            dropdown.innerHTML = `<div class="autocomplete-loading">No Apple Music matches found. Choose a listed song to add it.</div>`;
            return;
          }

          dropdown.innerHTML = data.results.map(track => {
            const artistName = track.artistName || 'Unknown Artist';
            const trackName = track.trackName || 'Unknown Song';
            const rawTitle = `${artistName} - ${trackName}`;
            const artworkUrl = track.artworkUrl60 || '';
            return `
            <div class="autocomplete-item" data-title="${encodeDataValue(rawTitle)}">
              <img src="${escapeAttr(artworkUrl)}" class="autocomplete-art" alt="Album art" />
              <div class="autocomplete-text">
                <div class="autocomplete-title">${escapeHtml(trackName)}</div>
                <div class="autocomplete-artist">${escapeHtml(artistName)}</div>
              </div>
            </div>
          `}).join('');

          dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
              state.pendingSongTitle = normalizeSongKey(decodeDataValue(item.dataset.title));
              state.pendingSongRoles = [];
              state.pendingOtherInstrument = '';
              input.value = '';
              dropdown.classList.add('hidden');
              renderSongsEditor();
            });
          });
        } catch (err) {
          dropdown.innerHTML = `<div class="autocomplete-loading">Error fetching suggestions</div>`;
        }
      }, 400); // 400ms debounce
    });
    
  }
}

function addSongFromInput() {
  const title = state.pendingSongTitle;
  if (!title) {
    toast('Select a song from Apple Music first', 'error');
    document.getElementById('song-input-new')?.focus();
    return;
  }

  const selectedRoles = buildSelectedSongRoles(state.pendingSongRoles, state.pendingOtherInstrument);

  if (selectedRoles.length === 0) {
    if (state.pendingSongRoles.includes('other')) {
      toast('Type the instrument name for Other', 'error');
      document.getElementById('pending-other-instrument-input')?.focus();
    } else {
      toast('Please select at least one instrument for this song first.', 'error');
    }
    return;
  }

  if (!state.editSongs[title]) state.editSongs[title] = [];
  for (const rid of selectedRoles) {
    if (!state.editSongs[title].includes(rid)) state.editSongs[title].push(rid);
  }

  state.pendingSongTitle = '';
  state.pendingSongRoles = [];
  state.pendingOtherInstrument = '';
  renderSongsEditor();
  setTimeout(() => { const el = document.getElementById('song-input-new'); if (el) el.focus(); }, 50);
}

async function saveEdit() {
  const nameInput = document.getElementById('edit-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); toast('Please enter your name', 'error'); return; }

  if (state.pendingSongTitle) {
    addSongFromInput();
    if (state.pendingSongTitle) return;
  }

  // Free-form song entry is intentionally disabled for now; users must choose a listed Apple result.
  const songInput = document.getElementById('song-input-new');
  if (songInput && songInput.value.trim()) {
    songInput.focus();
    toast('Select a song from Apple Music before saving', 'error');
    return;
  }

  const saveBtn = document.getElementById('modal-save-btn');
  const defaultSaveText = saveBtn.textContent;
  const resetSaveButton = () => {
    saveBtn.disabled = false;
    saveBtn.textContent = defaultSaveText;
  };
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const finalSongs = {};
  const allSongRids = new Set();
  
  for (const [title, rids] of Object.entries(state.editSongs)) {
    if (rids.length === 0) {
      resetSaveButton();
      toast(`Please add an instrument to the song "${title}", or remove it.`, 'error');
      return;
    }
    finalSongs[title] = rids;
    rids.forEach(r => allSongRids.add(r));
  }

  const finalRoles = Array.from(allSongRids);
  
  if (finalRoles.length === 0) {
    resetSaveButton();
    toast('Select at least one instrument', 'error'); 
    return;
  }

  const payload = {
    name,
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
      members = members.map(m => m.id === saved.id ? saved : m);
      toast('Profile updated!', 'success');
    } else {
      saved = await apiFetch(API, {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      members.push(saved);
      toast(`${saved.name} added to members 🎼`, 'success');
    }
    closeModal();
    renderMembers();
  } catch (err) {
    toast(err.message, 'error');
    resetSaveButton();
  }
}

// ===== MODAL HELPERS =====
function setModalContent(html) { document.getElementById('modal-content').innerHTML = html; }

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal({ clearHistory = true } = {}) {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  state.editingId = null;
  if (clearHistory) modalBackStack = [];
}

function pushModalHistory(backTarget) {
  if (typeof window === 'undefined' || !window.history?.pushState) return;
  modalBackStack.push(backTarget);
  window.history.pushState({ jamSessionModal: true }, '', window.location.href);
}

function restorePreviousModal() {
  const backTarget = modalBackStack.pop();
  if (!backTarget) return false;
  if (backTarget.type === 'closeModal') {
    closeModal({ clearHistory: false });
    return true;
  }
  if (backTarget.type === 'band') {
    openBandModal(backTarget.bandName, backTarget.songsMap);
    return true;
  }
  if (backTarget.type === 'instantBand') {
    openInstantBandModal(backTarget.title, backTarget.roleMap);
    return true;
  }
  return false;
}

// ===== TOAST =====
function toast(msg, type = 'success') {
  const icon = type === 'success' ? '✅' : '⚠️';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  el.append(iconEl, ` ${msg}`);
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Helper to format "Artist - Title" strings beautifully
function formatSongTitle(rawTitle) {
  if (!rawTitle.includes(' - ')) {
    return `<span class="song-title" style="font-weight:500;color:var(--text-primary)">${escapeHtml(rawTitle)}</span>`;
  }
  const [artist, ...titleParts] = rawTitle.split(' - ');
  const title = titleParts.join(' - ');
  return `
    <div style="display:flex;flex-direction:column;line-height:1.1">
      <span class="song-title" style="font-weight:600;color:var(--text-primary)">${escapeHtml(title)}</span>
      <span class="song-artist" style="font-size:0.7rem;color:var(--text-muted)">${escapeHtml(artist)}</span>
    </div>
  `;
}

function handleDocumentClick(e) {
  const target = e.target;
  const input = document.getElementById('song-input-new');
  const dropdown = document.getElementById('autocomplete-dropdown');
  if (input && dropdown && !input.contains(target) && !dropdown.contains(target)) {
    dropdown.classList.add('hidden');
  }

  if (state.otherDropdownOpen && !target.closest?.('.other-filter-wrap')) {
    state.otherDropdownOpen = false;
    renderFilterChips();
  }
}

// ===== INIT =====
async function init() {
  renderFilterChips();

  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value;
    renderMembers();
  });

  document.getElementById('add-member-btn').addEventListener('click', openAddModal);

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('popstate', () => {
    if (!restorePreviousModal()) closeModal({ clearHistory: false });
  });

  // ── View toggle ─────────────────────────────────────────────────────────────
  function switchView(view) {
    state.view = view;
    state.otherDropdownOpen = false;
    const membersGrid  = document.getElementById('members-grid');
    const songbookGrid = document.getElementById('songbook-grid');
    const bandbookGrid = document.getElementById('bandbook-grid');
    const filterBar    = document.getElementById('filter-bar');
    
    const btnMembers   = document.getElementById('toggle-members');
    const btnSongbook  = document.getElementById('toggle-songbook');
    const btnBandbook  = document.getElementById('toggle-bandbook');
    const searchInput  = document.getElementById('search-input');
    const titleText    = document.getElementById('section-title-text');

    // Reset visibility and active states
    membersGrid.classList.add('hidden');
    songbookGrid.classList.add('hidden');
    bandbookGrid.classList.add('hidden');
    filterBar.classList.add('hidden');
    btnMembers.classList.remove('active');
    btnSongbook.classList.remove('active');
    btnBandbook.classList.remove('active');

    if (titleText) {
      if (view === 'members') titleText.textContent = 'The Crew';
      else if (view === 'songbook') titleText.textContent = 'Songbook';
      else if (view === 'bandbook') titleText.textContent = 'Bandbook';
    }

    if (view === 'members') {
      membersGrid.classList.remove('hidden');
      filterBar.classList.remove('hidden');
      btnMembers.classList.add('active');
      searchInput.placeholder = 'Search members, bands, or songs…';
    } else if (view === 'songbook') {
      songbookGrid.classList.remove('hidden');
      btnSongbook.classList.add('active');
      searchInput.placeholder = 'Search band or song…';
    } else if (view === 'bandbook') {
      bandbookGrid.classList.remove('hidden');
      btnBandbook.classList.add('active');
      searchInput.placeholder = 'Search band…';
    }
    renderMembers();
  }

  document.getElementById('toggle-members').addEventListener('click', () => switchView('members'));
  document.getElementById('toggle-songbook').addEventListener('click', () => switchView('songbook'));
  document.getElementById('toggle-bandbook').addEventListener('click', () => switchView('bandbook'));
  document.querySelector('.logo')?.addEventListener('click', e => {
    e.preventDefault();
    closeModal();
    state.search = '';
    state.filters = [];
    state.customFilter = 'all';
    state.otherDropdownOpen = false;
    document.getElementById('search-input').value = '';
    renderFilterChips();
    switchView('members');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  try {
    await loadMembers();
  } catch (err) {
    console.error(err);
    document.getElementById('members-grid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Could not connect to server</div>
        <p class="empty-desc">Make sure the server is running: <code>python main.py</code></p>
      </div>`;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    apiFetch,
    buildBandbookFrom,
    buildSongbookFrom,
    buildSelectedSongRoles,
    decodeDataValue,
    encodeDataValue,
    escapeAttr,
    escapeHtml,
    formatSongTitle,
    getInitials,
    getCustomRoleOptions,
    getOrderedRoleIds,
    getRole,
    makeCustomRoleId,
    memberMatchesRoleFilter,
    memberMatchesRoleFilters,
    normaliseSearch,
    normalizeSongKey,
    shouldOpenCardFromKey,
    stripAccents,
    ROLES,
  };
}
