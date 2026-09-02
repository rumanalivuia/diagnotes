import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textOf, htmlOf, emptyDoc } from '../src/lib/richtext.js';
import { matchesQuery, filterComments, allTags } from '../src/lib/search.js';

test('textOf renders paragraphs, bold, lists', () => {
  const blocks = [
    { t: 'p', r: [{ x: 'Hello ' }, { x: 'world', b: 1 }] },
    { t: 'ul', items: [{ r: [{ x: 'one' }] }, { r: [{ x: 'two' }] }] },
  ];
  assert.equal(textOf(blocks), 'Hello world\n• one\n• two');
});

test('htmlOf escapes user text and emits <b>/<i>/<ul>', () => {
  const blocks = [
    { t: 'p', r: [{ x: 'a<b' }, { x: '&', b: 1 }] },
    { t: 'ul', items: [{ r: [{ x: 'x' }] }] },
  ];
  const html = htmlOf(blocks);
  assert.ok(html.includes('a&lt;b'));
  assert.ok(html.includes('<b>&amp;</b>'));
  assert.ok(html.includes('<ul><li>x</li></ul>'));
});

test('emptyDoc returns one empty paragraph', () => {
  const d = emptyDoc();
  assert.equal(d.length, 1);
  assert.equal(d[0].t, 'p');
  assert.deepEqual(d[0].r, [{ x: '' }]);
});

test('search matches title', () => {
  assert.ok(matchesQuery({ title: 'Hemolyzed sample', body: [] }, 'hemolyzed'));
  assert.ok(!matchesQuery({ title: 'Normal', body: [] }, 'hemolyzed'));
});

test('search matches body text', () => {
  const c = { title: 'X', body: [{ t: 'p', r: [{ x: 'bowel loops' }] }] };
  assert.ok(matchesQuery(c, 'bowel'));
});

test('filter combines type + category + tag with AND', () => {
  const comments = [
    { id: '1', type: 'shared', category_id: 'catA', tags: ['urgent'], status: 'approved', title: 'A', body: [] },
    { id: '2', type: 'shared', category_id: 'catA', tags: ['normal'], status: 'approved', title: 'B', body: [] },
    { id: '3', type: 'personal', category_id: 'catA', tags: ['urgent'], status: 'draft', title: 'C', body: [] },
  ];
  const out = filterComments(comments, { type: 'shared', categoryId: 'catA', tag: 'urgent' });
  assert.deepEqual(out.map((c) => c.id), ['1']);
});

test('allTags aggregates with counts', () => {
  const tags = allTags([
    { tags: ['a', 'b'] },
    { tags: ['a'] },
    { tags: ['c'] },
  ]);
  assert.deepEqual(tags[0], { name: 'a', count: 2 });
});
