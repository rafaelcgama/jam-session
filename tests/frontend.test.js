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

test('builds songbook rows and filters by musician name', () => {
  const musicians = [
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

  assert.deepEqual(app.buildSongbookFrom(musicians, 'ana'), {
    'Radiohead - Creep': { singer: ['Ana'] },
    'Nirvana - Lithium': { guitarist: ['Ana'] },
  });
  assert.deepEqual(app.buildSongbookFrom(musicians, 'creep'), {
    'Radiohead - Creep': { singer: ['Ana'], guitarist: ['Ben'] },
  });
});

test('builds bandbook groups and keeps unknown originals together', () => {
  const musicians = [
    {
      name: 'Ana',
      songs: {
        'Radiohead - Creep': ['singer'],
        'Untitled Jam': ['guitarist'],
      },
    },
  ];

  assert.deepEqual(app.buildBandbookFrom(musicians), {
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
