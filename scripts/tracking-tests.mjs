import assert from 'node:assert/strict';
import {trackingLink,receiptBlob} from '../lib/trackingLinks.js';
const input={base:'https://mellodeals.com/track/',reference:'112200',organization:'kenza-services',token:'private-token'};
assert.equal(trackingLink(input),'https://mellodeals.com/track/112200');
assert.equal(trackingLink({...input,base:'https://mellodeals.com/track/?ref='}),'https://mellodeals.com/track/?ref=112200');
assert.equal(trackingLink({...input,reference:'58880/1'}),'https://mellodeals.com/track/?ref=58880%2F1');
assert.equal(trackingLink({...input,base:'https://mellodeals.com/track/{ref}'}),'https://mellodeals.com/track/112200');
assert.equal(trackingLink({...input,base:'javascript:alert(1)'}),'');
const fallback=new URL(trackingLink({...input,base:'',origin:'https://kenza.tracker.mellodeals.com'}));
assert.equal(fallback.pathname,'/public-track');assert.equal(fallback.searchParams.get('org'),'kenza-services');assert.equal(fallback.searchParams.get('token'),'private-token');
const external=new URL(trackingLink({...input,base:'https://mellodeals.com/track/?org=other&token=old'}));
assert.equal(external.searchParams.has('org'),false);assert.equal(external.searchParams.has('token'),false);
// Snapshot bytes are decoded locally, so CSP connect-src does not need data:.
globalThis.fetch=()=>{throw new Error('Unexpected network access')};
const blob=receiptBlob('data:image/png;base64,iVBORw0KGgo=');
assert.equal(blob.type,'image/png');assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[137,80,78,71,13,10,26,10]);
assert.throws(()=>receiptBlob('data:text/html;base64,aGVsbG8='));
console.log('PASS: clean links, tenant-safe fallback and local receipt bytes.');
