// Shared validation contains no credentials and is safe to use in the browser.
export const TEST_TEMPLATE='hello_world';
export const TEST_LANGUAGE='en_US';
export const TEST_HELLO='Hello World · WhatsApp API connection test';
export const TEST_CONFIG_FIELDS='phone_id,business_id,api_version,recipients,enabled,verified_at,webhook_at,updated_at';
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function testRecipients(value){
 const phones=Array.isArray(value)?value:String(value||'').split(/[\s,;]+/);
 const normalized=[...new Set(phones.map(p=>String(p).trim().replace(/^\+/,'' )).filter(Boolean))];
 if(!normalized.length||normalized.length>5||normalized.some(p=>!(/^[1-9]\d{7,14}$/).test(p)))throw new Error('Add 1–5 test recipients with country code, using digits only.');
 return normalized;
}
export function testReplyWindow(message,now=Date.now()){
 const when=Date.parse(message?.created_at||'');
 return message?.direction==='incoming'&&Number.isFinite(when)&&when<=now&&now-when<24*60*60*1000;
}
export function testProviderError(code){
 return ({190:'The Meta access token expired or is invalid. Generate a new token in API Setup.',10:'The token is missing the required WhatsApp permission.',100:'Check the Phone number ID, API version and template settings.',131030:'Add and verify this recipient in Meta API Setup first.',131047:'The reply window has closed. Send Hello World and reply from your phone first.',132001:'The Hello World template is unavailable for this sender. Use the Meta test number.'})[code]||`Meta rejected the request${/^\d+$/.test(String(code||''))?` (code ${code})`:''}. Check API Setup and try again.`;
}
