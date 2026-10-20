import assert from 'node:assert/strict';
import {EMAIL_DESIGN_STARTER,setEmailBanner,readEmailBanner} from '../lib/emailDesign.js';
import {parseEmailContacts} from '../lib/emailContacts.js';
import {renderEmailTemplate,defaultEmailTemplate} from '../lib/emailTemplates.js';
let body=setEmailBanner(EMAIL_DESIGN_STARTER,'header',{url:'https://example.test/header.png',width:480,align:'left',alt:'Company & services'});
body=setEmailBanner(body,'footer',{url:'https://example.test/footer.png',width:600,align:'right'});
assert.equal(readEmailBanner(body,'header').width,480);assert.equal(readEmailBanner(body,'footer').align,'right');
body=setEmailBanner(body,'header',{url:'https://example.test/updated.png',width:320,align:'center'});
assert.equal((body.match(/workspace-header-banner:/g)||[]).length,1);assert(!body.includes('header.png'));
const message=renderEmailTemplate({...defaultEmailTemplate('general'),content_format:'html',body},{company:'Kenza Services',name:'Example',reference:'TEST-001',status:'Ready',tracking_link:'https://example.test/track'});
assert.match(message.html,/updated.png/);assert.match(message.html,/footer.png/);assert.match(message.html,/Track your service/);assert.doesNotMatch(message.html,/Company &amp; services/);

assert(!setEmailBanner(body,'footer',{}).includes('footer.png'));
for(const url of ['javascript:alert(1)','data:image/png;base64,x','http://example.test/a','https://user:pass@example.test/a'])assert.throws(()=>setEmailBanner(body,'header',{url}));
assert.deepEqual(parseEmailContacts('Alice <ALICE@example.test>; bob@example.test\nalice@example.test'),[{email:'alice@example.test',name:'Alice'},{email:'bob@example.test',name:''}]);
assert.throws(()=>parseEmailContacts('bad address'));assert.throws(()=>parseEmailContacts(Array.from({length:101},(_,i)=>`p${i}@example.test`).join(';')));
console.log('PASS: branded layout, header/footer replacement and removal, safe banner URLs, width/alignment, rendered buttons and contact parsing/deduplication.');
