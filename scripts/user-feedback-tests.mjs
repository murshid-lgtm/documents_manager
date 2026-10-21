import fs from 'node:fs';import assert from 'node:assert/strict';
const {userError}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('lib/userError.js','utf8')).toString('base64'));let checks=0;
for(const message of ['Test connection saved. Customer automations are unchanged.','Meta connection checked · +1 555 678 2026.','Check your connection and configure the platform URL first.','The WhatsApp test connection could not be loaded.']){assert.equal(userError(message),message);checks++}
for(const message of ['Failed to fetch','NetworkError when attempting to fetch resource.','Network request failed','Connection refused','Connection reset by peer','Connection timed out','connect ETIMEDOUT','ECONNRESET']){assert.equal(userError(new Error(message)),'The server could not be reached. Check your internet connection and try again.');checks++}
assert.match(userError({code:'42501',message:'permission denied for table secret'}),/do not have permission/);checks++;
assert(!userError('Postgres error: column secret does not exist').includes('secret'));checks++;
console.log(`PASS: ${checks} feedback checks: connection successes retain their text, actionable setup errors stay specific, real network failures remain friendly and technical details remain hidden.`);
