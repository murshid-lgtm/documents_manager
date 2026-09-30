export const STAFF_MODULES=['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports'];
export function validateStaffModules(value){
 if(value===null)return null;
 if(!Array.isArray(value)||value.some(key=>!STAFF_MODULES.includes(key)))throw Object.assign(new Error('Select valid staff modules.'),{status:400,code:'INVALID_MODULES'});
 return [...new Set(value)];
}
