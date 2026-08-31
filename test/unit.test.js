import { describe, it, expect } from 'vitest';

globalThis.__XFR_TEST__ = true;
await import('../xenforo-story-reader.user.js');
const { Adapter, Store, crc32, makeZip, bodyToXhtml, buildEpub, esc } = globalThis.__xfr;

const doc = (html) => Adapter.parse(html);

describe('Adapter — URLs', () => {
  it('extracts threadId from the location', () => {
    expect(Adapter.threadId()).toBe('853195');
  });

  it('builds the threadmarks index URL', () => {
    expect(Adapter.threadmarksUrl()).toBe(
      'https://forums.spacebattles.com/threads/test-story.853195/threadmarks'
    );
  });

  // regression: categories are query params, NOT /category-N paths (bug #1)
  it('addresses categories and pages via query params', () => {
    const base = 'https://forums.spacebattles.com/threads/test-story.853195/threadmarks';
    expect(Adapter.tmUrl(1, 1)).toBe(base);
    expect(Adapter.tmUrl(3, 1)).toBe(base + '?threadmark_category=3');
    expect(Adapter.tmUrl(1, 2)).toBe(base + '?page=2');
    expect(Adapter.tmUrl(3, 2)).toBe(base + '?threadmark_category=3&page=2');
  });

  it('reads the category id from a tab href, defaulting to 1', () => {
    expect(Adapter.categoryIdFromHref('/threads/x.1/threadmarks?threadmark_category=4')).toBe(4);
    expect(Adapter.categoryIdFromHref('/threads/x.1/threadmarks')).toBe(1);
    expect(Adapter.categoryIdFromHref(null)).toBe(1);
  });
});

describe('Adapter — parsing', () => {
  const tmIndex = doc(`
    <div class="block-tabHeader--threadmarkCategoryTabs">
      <a class="tabs-tab" href="/threads/x.853195/threadmarks">Threadmarks</a>
      <a class="tabs-tab" href="/threads/x.853195/threadmarks?threadmark_category=3">Extras</a>
    </div>
    <div class="block--threadmarkList">
      <div class="structItem--threadmark"><div class="structItem-title">
        <a href="/threads/x.853195/post-100">1.1</a></div></div>
      <div class="structItem--threadmark"><div class="structItem-title">
        <a href="/threads/x.853195/page-7#post-200">2.1</a></div></div>
      <div class="structItem--threadmark"><div class="structItem-title"></div></div>
      <div class="pageNav"><a>1</a><a>2</a><a>5</a><a>Next</a></div>
    </div>
    <div class="thread-footer"><div class="pageNav"><a>1</a><a>1345</a></div></div>
  `);

  it('parses threadmark rows: title, postId, page (default 1)', () => {
    const rows = Adapter.threadmarkRows(tmIndex);
    expect(rows).toEqual([
      { title: '1.1', postId: '100', page: 1 },
      { title: '2.1', postId: '200', page: 7 },
    ]);
  });

  // regression: page count must come from the threadmark list block,
  // not the thread footer's identically-classed pageNav (bug #2)
  it('reads max page from the threadmark list pageNav, ignoring the footer decoy', () => {
    expect(Adapter.tmMaxPage(tmIndex)).toBe(5);
  });

  it('lists category tabs with labels and hrefs', () => {
    const tabs = Adapter.categoryTabs(tmIndex);
    expect(tabs.map((t) => t.label)).toEqual(['Threadmarks', 'Extras']);
  });

  it('parses posts: id, author, body html', () => {
    const page = doc(`
      <article class="message message--post" data-content="post-100" data-author="alice">
        <div class="message-body"><div class="bbWrapper"><p>chapter text</p></div></div>
      </article>
      <article class="message" data-content="post-101" data-author="bob">
        <div class="message-body"><div class="bbWrapper">a comment</div></div>
      </article>
      <article class="message"><div class="message-body"></div></article>
    `);
    const posts = Adapter.posts(page);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual({ id: '100', author: 'alice', bodyHtml: '<p>chapter text</p>' });
    expect(posts[1].author).toBe('bob');
  });
});

describe('Store.makeIndex', () => {
  const index = Store.makeIndex('853195', 'Test Story', [
    { label: 'Threadmarks', chapters: [{ title: '1.1', postId: '100' }, { title: '2.1', postId: '300' }] },
    { label: 'Extras', chapters: [{ title: 'omake', postId: '200' }, { title: 'dead', postId: null }] },
  ]);

  it('grouped keeps section order, drops null postIds', () => {
    expect(index.grouped().map((c) => c.postId)).toEqual(['100', '300', '200']);
  });

  it('allChapters sorts numerically by postId across sections', () => {
    expect(index.allChapters().map((c) => c.postId)).toEqual(['100', '200', '300']);
  });

  it('firstChapterId is the first story chapter, not the oldest post', () => {
    expect(index.firstChapterId()).toBe('100');
  });
});

describe('EPUB pipeline', () => {
  it('crc32 matches the reference check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('makeZip emits local header first, mimetype uncompressed-first, and a valid EOCD', async () => {
    const blob = makeZip([
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'a.txt', data: 'hello' },
    ]);
    const b = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(dv.getUint16(8, true)).toBe(0); // STORE, no compression
    expect(new TextDecoder().decode(b.slice(30, 38))).toBe('mimetype'); // first entry
    const eocd = b.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50); // EOCD signature
    expect(dv.getUint16(eocd + 10, true)).toBe(2); // total entries
  });

  it('bodyToXhtml sanitizes and promotes lazy images', () => {
    const x = bodyToXhtml(
      '<p class="c" id="i" onclick="evil()">hi<script>evil()</script></p><img data-src="https://x/y.png">',
      'A & "B"'
    );
    expect(x).not.toContain('script');
    expect(x).not.toContain('onclick');
    expect(x).not.toContain('class=');
    expect(x).toContain('src="https://x/y.png"');
    expect(x).toContain('<title>A &amp; &quot;B&quot;</title>');
  });

  it('buildEpub assembles a whole-story epub from the index', async () => {
    const index = Store.makeIndex('853195', 'Test Story', [
      { label: 'Threadmarks', chapters: [{ title: '1.1', postId: '100' }, { title: '1.2', postId: '200' }] },
    ]);
    const orig = Store.getChapterBody;
    Store.getChapterBody = async () => '<p>body</p>';
    try {
      const blob = await buildEpub(index, null);
      const b = new Uint8Array(await blob.arrayBuffer());
      const text = new TextDecoder().decode(b);
      expect(new TextDecoder().decode(b.slice(30, 38))).toBe('mimetype');
      expect(text).toContain('chap1.xhtml');
      expect(text).toContain('chap2.xhtml');
      expect(text).toContain('toc.ncx');
      expect(text).toContain('<dc:title>Test Story</dc:title>');
    } finally {
      Store.getChapterBody = orig;
    }
  });
});

describe('esc', () => {
  it('escapes the four html specials', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
