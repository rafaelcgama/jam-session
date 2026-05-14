const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../frontend/app.js');

test('escapes text and attribute values before rendering user content', () => {
  const unsafe = `Miles <img src=x onerror=alert(1)> "Davis"`;

  assert.equal(
    app.escapeHtml(unsafe),
    'Miles &lt;img src=x onerror=alert(1)&gt; &quot;Davis&quot;'
  );
  assert.equal(app.formatSongTitle('Radiohead - <Creep>'), `
    <div style="display:flex;flex-direction:column;line-height:1.1">
      <span class="song-title" style="font-weight:600;color:var(--text-primary)">&lt;Creep&gt;</span>
      <span class="song-artist" style="font-size:0.7rem;color:var(--text-muted)">Radiohead</span>
    </div>
  `);
});

test('encodes and decodes dataset values without losing special characters', () => {
  const raw = `AC/DC - It's a Long Way <Live>`;
  assert.equal(app.decodeDataValue(app.encodeDataValue(raw)), raw);
});

test('normalizes remastered song editions before saving', () => {
  assert.equal(
    app.normalizeSongKey(`oasis - don't look back in anger (remastered)`),
    `Oasis - Don't Look Back In Anger`
  );
  assert.equal(
    app.normalizeSongKey(`Oasis - Don't Look Back In Anger - 2014 Remaster`),
    `Oasis - Don't Look Back In Anger`
  );
});

test('keeps Other as the final instrument with the clef icon', () => {
  const other = app.ROLES.at(-1);
  assert.equal(other.id, 'other');
  assert.equal(other.label, 'Other');
  assert.equal(other.icon, '🎼');
});

test('builds and displays custom Other instruments with the clef icon', () => {
  const roleId = app.makeCustomRoleId('  berimbau  ');
  assert.equal(roleId, 'other:Berimbau');
  assert.deepEqual(app.getRole(roleId), {
    id: 'other:Berimbau',
    label: 'Berimbau',
    icon: '🎼',
    color: '#8fa3ff',
  });
});

test('matches custom instruments when filtering by Other', () => {
  assert.equal(app.memberMatchesRoleFilter({ roles: ['other:Berimbau'] }, 'other'), true);
  assert.equal(app.memberMatchesRoleFilter({ roles: ['guitarist'] }, 'other'), false);
  assert.equal(app.memberMatchesRoleFilter({ roles: ['other:Cavaco'] }, 'other', 'other:Cavaco'), true);
  assert.equal(app.memberMatchesRoleFilter({ roles: ['other:Berimbau'] }, 'other', 'other:Cavaco'), false);
});

test('collects custom instrument filter options from roles and songs', () => {
  const members = [
    {
      roles: ['other:Cavaco'],
      songs: { 'Marcos Carnaval & Filipe Guerra - Cavaco': ['singer'] },
    },
    {
      roles: ['singer'],
      songs: { 'Original Jam': ['other:Berimbau'] },
    },
  ];

  assert.deepEqual(app.getCustomRoleOptions(members), ['other:Berimbau', 'other:Cavaco']);
});

test('collects multiple custom instruments for one pending song', () => {
  assert.deepEqual(
    app.buildSelectedSongRoles(['other', 'other:Berimbau'], 'kazoo'),
    ['other:Berimbau', 'other:Kazoo']
  );
});

test('orders custom song instruments after standard instruments', () => {
  assert.deepEqual(
    app.getOrderedRoleIds({
      'other:Berimbau': ['Ana'],
      singer: ['Ben'],
      guitarist: ['Cara'],
    }),
    ['singer', 'guitarist', 'other:Berimbau']
  );
});

test('builds songbook rows and filters by member name', () => {
  const members = [
    {
      name: 'Ana',
      songs: {
        'Radiohead - Creep': ['singer'],
        'Nirvana - Lithium': ['guitarist'],
      },
    },
    {
      name: 'Ben',
      songs: {
        'Radiohead - Creep': ['guitarist'],
      },
    },
  ];

  assert.deepEqual(app.buildSongbookFrom(members, 'ana'), {
    'Radiohead - Creep': { singer: ['Ana'] },
    'Nirvana - Lithium': { guitarist: ['Ana'] },
  });
  assert.deepEqual(app.buildSongbookFrom(members, 'creep'), {
    'Radiohead - Creep': { singer: ['Ana'], guitarist: ['Ben'] },
  });
});

test('builds songbook rows with custom Other instruments', () => {
  const members = [
    {
      name: 'Ana',
      songs: {
        'Original Jam': ['other:Berimbau'],
      },
    },
  ];

  assert.deepEqual(app.buildSongbookFrom(members), {
    'Original Jam': { 'other:Berimbau': ['Ana'] },
  });
});

test('builds bandbook groups and keeps unknown originals together', () => {
  const members = [
    {
      name: 'Ana',
      songs: {
        'Radiohead - Creep': ['singer'],
        'Untitled Jam': ['guitarist'],
      },
    },
  ];

  assert.deepEqual(app.buildBandbookFrom(members), {
    Radiohead: {
      Creep: {
        singer: ['Ana'],
      },
    },
    'Originals / Unknown': {
      'Untitled Jam': {
        guitarist: ['Ana'],
      },
    },
  });
});
