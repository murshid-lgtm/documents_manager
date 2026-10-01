export const STAFF_MODULES=['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports','crm','sales','services'];
export function validateStaffModules(value){
 if(value===null)return null;
 if(!Array.isArray(value)||value.some(key=>!STAFF_MODULES.includes(key)))throw Object.assign(new Error('Select valid staff modules.'),{status:400,code:'INVALID_MODULES'});
 return [...new Set(value)];
}

export function validateStaffPassword(value){
 if(typeof value!=='string'||value.length<12||value.length>128)throw Object.assign(new Error('Use a password between 12 and 128 characters.'),{status:400,code:'INVALID_PASSWORD'});
 return value;
}
