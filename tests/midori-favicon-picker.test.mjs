import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractHeadIcons,
  extractManifestIcons,
  iconMimeType,
  needsManifest,
  parseSizes,
  rankIcons,
  scoreIcon,
} from '../src/browser/components/verticaltabs/MidoriFaviconPicker.sys.mjs';

// Link tags copied from the live pages of the default Essentials.
const GITHUB_HEAD = `
<link rel="fluid-icon" href="https://github.com/fluidicon.png" title="GitHub">
<link rel="mask-icon" href="https://github.githubassets.com/assets/pinned-octocat-093da3e6fa40.svg" color="#000000">
<link rel="alternate icon" class="js-site-favicon" type="image/png" href="https://github.githubassets.com/favicons/favicon.png">
<link rel="icon" class="js-site-favicon" type="image/svg+xml" href="https://github.githubassets.com/favicons/favicon.svg" data-base-href="https://github.githubassets.com/favicons/favicon">`;

const YOUTUBE_HEAD = `
<link rel="shortcut icon" href="https://www.youtube.com/s/desktop/5d669aa8/img/favicon.ico" type="image/x-icon">
<link rel="icon" href="https://www.youtube.com/s/desktop/5d669aa8/img/favicon_32x32.png" sizes="32x32">
<link rel="icon" href="https://www.youtube.com/s/desktop/5d669aa8/img/favicon_48x48.png" sizes="48x48">
<link rel="icon" href="https://www.youtube.com/s/desktop/5d669aa8/img/favicon_96x96.png" sizes="96x96">
<link rel="icon" href="https://www.youtube.com/s/desktop/5d669aa8/img/favicon_144x144.png" sizes="144x144">`;

const REDDIT_HEAD = `<link href="https://www.redditstatic.com/shreddit/assets/favicon/64x64.png" rel="icon shortcut" sizes="64x64" />`;

const SPOTIFY_HEAD = `
<link rel="icon" sizes="32x32" type="image/png" href="https://open.spotifycdn.com/cdn/images/favicon32.b64ecc03.png"/>
<link rel="icon" sizes="16x16" type="image/png" href="https://open.spotifycdn.com/cdn/images/favicon16.1c487bff.png"/>
<link rel="icon" href="https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico"/>`;

test('a vector icon beats any raster size', () => {
  const { icons } = extractHeadIcons(GITHUB_HEAD, 'https://github.com/');
  const ranked = rankIcons(icons, 'https://github.com');
  assert.equal(ranked[0].url, 'https://github.githubassets.com/favicons/favicon.svg');
});

test('mask and fluid icons are ignored', () => {
  const { icons } = extractHeadIcons(GITHUB_HEAD, 'https://github.com/');
  const urls = icons.map(icon => icon.url);
  assert.ok(!urls.some(url => url.includes('fluidicon')));
  assert.ok(!urls.some(url => url.includes('pinned-octocat')));
});

test('the largest declared raster wins', () => {
  const { icons } = extractHeadIcons(YOUTUBE_HEAD, 'https://www.youtube.com/');
  assert.equal(
    rankIcons(icons, 'https://www.youtube.com')[0].url,
    'https://www.youtube.com/s/desktop/5d669aa8/img/favicon_144x144.png'
  );

  const reddit = extractHeadIcons(REDDIT_HEAD, 'https://www.reddit.com/').icons;
  assert.equal(reddit.length, 1);
  assert.equal(reddit[0].size, 64);
});

test('an undeclared icon file is assumed to hold more than a 32px png', () => {
  const { icons } = extractHeadIcons(SPOTIFY_HEAD, 'https://open.spotify.com/');
  assert.match(rankIcons(icons, 'https://open.spotify.com')[0].url, /\.ico$/);
});

test('apple touch icons are valued by their declared or assumed size', () => {
  const html = `<link rel="apple-touch-icon" href="/a.png"><link rel="icon" href="/f.png" sizes="64x64">`;
  const { icons } = extractHeadIcons(html, 'https://example.com/');
  assert.equal(rankIcons(icons, 'https://example.com')[0].url, 'https://example.com/a.png');
});

test('relative links resolve against the page and unsafe schemes are dropped', () => {
  const html = `
    <link rel="icon" href="/img/i.png" sizes="48x48">
    <link rel="icon" href="javascript:alert(1)">
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="icon" href="file:///etc/passwd">`;
  const { icons } = extractHeadIcons(html, 'https://example.com/app/');
  assert.deepEqual(icons.map(icon => icon.url), ['https://example.com/img/i.png']);
});

test('the manifest is reported and its icons parsed', () => {
  const head = `<link rel="manifest" href="/manifest.json"><link rel="icon" href="/f.png" sizes="16x16">`;
  const found = extractHeadIcons(head, 'https://app.example.com/');
  assert.equal(found.manifest, 'https://app.example.com/manifest.json');
  assert.equal(needsManifest(found.icons), true);

  const icons = extractManifestIcons(
    {
      icons: [
        { src: 'i-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'i-512.png', sizes: '512x512' },
        { src: 'mono.png', sizes: '512x512', purpose: 'monochrome' },
        { src: 'javascript:1', sizes: '512x512' },
      ],
    },
    'https://app.example.com/manifest.json'
  );
  assert.deepEqual(
    icons.map(icon => icon.url),
    ['https://app.example.com/i-192.png', 'https://app.example.com/i-512.png']
  );
  assert.equal(needsManifest(icons), false);
});

test('conventional locations close the ranking when a page declares nothing', () => {
  const ranked = rankIcons([], 'https://mail.google.com');
  assert.deepEqual(
    ranked.map(candidate => candidate.url),
    ['https://mail.google.com/apple-touch-icon.png', 'https://mail.google.com/favicon.ico']
  );
  const withDeclared = rankIcons(
    [{ url: 'https://mail.google.com/favicon.ico', type: '', size: 0, apple: false, score: 48 }],
    'https://mail.google.com'
  );
  assert.equal(withDeclared.filter(c => c.url.endsWith('/favicon.ico')).length, 1);
});

test('sizes are parsed and oversized icons rank just below a 512px one', () => {
  assert.equal(parseSizes('16x16 32x32 48x48'), 48);
  assert.equal(parseSizes('any'), 1000);
  assert.equal(parseSizes('nonsense'), 0);
  assert.equal(parseSizes(undefined), 0);

  const score = size => scoreIcon({ url: `https://a.test/${size}.png`, size });
  assert.ok(score(512) > score(4096));
  assert.ok(score(4096) > score(256));
  assert.ok(score(256) > score(64));
});

test('mime types come from the response, then from the extension', () => {
  assert.equal(iconMimeType('image/PNG; charset=binary', 'https://a.test/x'), 'image/png');
  assert.equal(iconMimeType('', 'https://a.test/x.svg?v=1'), 'image/svg+xml');
  assert.equal(iconMimeType('text/html', 'https://a.test/favicon.ico'), 'image/x-icon');
  assert.equal(iconMimeType('text/html', 'https://a.test/page'), null);
});

test('malformed markup never throws', () => {
  for (const html of [null, undefined, '', '<link', '<link rel=>', '<link rel="icon" href>', 42]) {
    assert.doesNotThrow(() => extractHeadIcons(html, 'https://a.test/'));
  }
});
