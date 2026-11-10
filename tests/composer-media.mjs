import assert from 'node:assert/strict';
import {normalizeMedia,selectMedia,compatibleMedia} from '../lib/composer-media.ts';
const media=[{id:'v1',mime:'video/mp4'},{id:'v2',mime:'video/quicktime'},{id:'cover',mime:'image/jpeg'},{id:'photo2',mime:'image/png'}];
let ids=selectMedia(['cover'],'v1','video',media);assert.deepEqual(ids,['v1']);
ids=selectMedia(ids,'v2','video',media);assert.deepEqual(ids,['v2']);
ids=selectMedia(ids,'v2','video',media);assert.deepEqual(ids,['v2'],'Repeated click must not silently deselect the single video');
assert.deepEqual(normalizeMedia(['cover','v1','v2','v1'],'video',media),['v1'],'Old mixed or multiple selections must become exactly one video');
assert.deepEqual(selectMedia(['v1'],'cover','video',media),['v1'],'A cover cannot replace the publishing video');
assert.deepEqual(normalizeMedia(['v1'],'photo',media),[]);
assert.deepEqual(selectMedia(['cover'],'photo2','carousel',media),['cover','photo2']);
assert.deepEqual(selectMedia(['cover','photo2'],'cover','carousel',media),['photo2']);
assert.deepEqual(selectMedia(['v1'],'cover','story',media),['cover']);
assert(!compatibleMedia('video',media[2]));
console.log('Composer: single video replacement, double-click stability, old draft normalization, cover isolation and carousel selection passed.');

assert.deepEqual(normalizeMedia(['cover','v1','v2'],'carousel',media),['cover','v1','v2']);
assert.deepEqual(selectMedia(['cover'],'v1','carousel',media),['cover','v1']);
