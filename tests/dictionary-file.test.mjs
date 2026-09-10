import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRubinate } from '../dist/index.js';

const csv = '赤羽橋駅,カスタム名詞,アカバネバシエキ';
test('CSV files work with both analyzers, relative paths and file URLs', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rubinate-csv-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, '辞書.csv');
  await writeFile(path, '\uFEFF' + csv + '\r\n');
  for (const dictionary of ['ipadic', 'unidic']) {
    const r = createRubinate({ dictionary, correspondence: false });
    const expected = await r.analyze('赤羽橋駅', { userDictionary: csv });
    const configured = createRubinate({ dictionary, userDictionaryPath: path, correspondence: false });
    assert.deepEqual(await configured.analyze('赤羽橋駅', { userDictionary: '' }), await r.analyze('赤羽橋駅'));
    for (const userDictionaryPath of [path, relative(process.cwd(), path), pathToFileURL(path)]) {
      assert.deepEqual(await r.analyze('赤羽橋駅', { userDictionaryPath }), expected);
    }
  }
});
test('call-level sources replace defaults; files reload and custom tokenizers receive CSV', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rubinate-csv-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'dictionary.csv');
  await writeFile(path, csv);
  const seen = [];
  const tokenizer = (surface, options) => { seen.push(options.userDictionary); return [{ surface, reading: '' }]; };
  const r = createRubinate({ userDictionaryPath: path, tokenizer });
  await r.analyze('駅');
  await r.analyze('駅', { userDictionary: '' });
  await writeFile(path, '東京,名詞,トウキョウ');
  await r.analyze('駅');
  await createRubinate({ userDictionary: csv, tokenizer }).analyze('駅', { userDictionaryPath: path });
  assert.deepEqual(seen, [csv, undefined, '東京,名詞,トウキョウ', '東京,名詞,トウキョウ']);
  await assert.rejects(r.analyze('', { userDictionary: csv, userDictionaryPath: path }), /only one/);
  await assert.rejects(r.analyze('駅', { userDictionaryPath: join(dir, 'missing.csv') }), { code: 'ENOENT' });
  await writeFile(path, 'invalid,csv');
  await assert.rejects(r.analyze('駅'), /three-column CSV/);
  for (const userDictionaryPath of ['', 42, new URL('https://example.com/dict.csv')]) {
    await assert.rejects(r.analyze('駅', { userDictionaryPath }), /filesystem path or file URL/);
  }
});

test('BOM CSV is consistent; empty quoted records and malformed UTF-8 reject safely', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rubinate-csv-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'bad.csv');
  await writeFile(path, Buffer.from([0xff, 0xfe, 0x80]));
  const r = createRubinate();
  await assert.rejects(r.analyze('駅', { userDictionaryPath: path }), /encoded data/);
  await assert.rejects(r.analyze('駅', { userDictionary: '""' }), /three-column CSV/);
  assert.deepEqual(await r.analyze('赤羽橋駅', { userDictionary: '\uFEFF' + csv }), await r.analyze('赤羽橋駅', { userDictionary: csv }));
});
