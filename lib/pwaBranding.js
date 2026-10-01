import {createClient} from '@supabase/supabase-js';
import {headers} from 'next/headers';
export async function pwaBranding(){const h=await headers();const host=h.get('host')||'';const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;try{if(!url||!key)return {};const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.rpc('public_branding',{request_host:host});return error?{}:data||{}}catch{return {}}}
export const safeBrandColor=(color,fallback)=>/^#[a-f\d]{6}$/i.test(color||'')?color:fallback;
