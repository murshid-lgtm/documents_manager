import {supabase} from './supabase';
// Short-lived memory only. Never persist customer/financial records to browser storage.
const snapshots=new Map();let user=null;
supabase.auth.onAuthStateChange((event,session)=>{const next=session?.user?.id||null;if(event==='SIGNED_OUT'||user&&user!==next)snapshots.clear();user=next});
export function workspaceScope(profile,orgId){return profile?.id&&orgId?JSON.stringify([profile.id,orgId,profile.role,profile.branch_id,!!profile.is_platform_super_admin]):null}
export function readWorkspaceCache(scope,key){if(!scope)return null;const value=snapshots.get(scope+'|'+key);if(!value)return null;if(Date.now()-value.at>30000){snapshots.delete(scope+'|'+key);return null}return structuredClone(value.data)}
export function writeWorkspaceCache(scope,key,data){if(!scope)return;if(snapshots.size>=24)snapshots.delete(snapshots.keys().next().value);snapshots.set(scope+'|'+key,{at:Date.now(),data:structuredClone(data)})}
export function invalidateWorkspaceCache(scope){for(const key of snapshots.keys())if(!scope||key.startsWith(scope+'|'))snapshots.delete(key)}
