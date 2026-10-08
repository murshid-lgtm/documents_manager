import {createClient} from '@supabase/supabase-js';
import {checkPortal} from '../../../lib/portalAccess';
import {CASE_SELECT} from '../../../lib/caseSelect';
import {apiJson,apiError,bearerToken,hasLiveSession} from '../../../lib/serverSecurity';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request){
 try{
  const token=bearerToken(request);
  if(!token)return apiJson({ok:false,error:'Please sign in to load cases.',code:'AUTH_REQUIRED'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!key)return apiJson({ok:false,error:'Cases are temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
  // Use the signed-in user's token, never a service key. RLS remains the
  // authority for tenant, branch, session and staff-module access.
  const viewer=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await viewer.auth.getUser(token);
  if(userError||!user||!await hasLiveSession(viewer))return apiJson({ok:false,error:'Your session has expired. Please sign in again.',code:'INVALID_SESSION'},401);
  const {data:profile,error:profileError}=await viewer.from('profiles').select('id,role,is_active,is_platform_super_admin,organization_id').eq('id',user.id).maybeSingle();
  if(profileError)throw profileError;
  if(!profile?.is_active)return apiJson({ok:false,error:'This account is unavailable.',code:'FORBIDDEN'},403);
  const denied=await checkPortal(viewer,profile,request);
  if(denied)return denied;
  const params=new URL(request.url).searchParams;
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||300);
  if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>300)return apiJson({ok:false,error:'Invalid page requested.',code:'INVALID_INPUT'},400);
  // Fetch the indexed tenant page first. A nested cases/documents/stages
  // query evaluates workflow authorization across the entire relation and can
  // exceed the database statement timeout on large workspaces.
  const baseSelect=CASE_SELECT.split(',\n')[0];
  let query=viewer.from('cases').select(baseSelect).order('created_at',{ascending:false}).order('id',{ascending:false});
  if(!profile.is_platform_super_admin)query=query.eq('organization_id',profile.organization_id);
  const {data,error}=await query.range(offset,offset+limit-1);
  if(error)return apiError(error,{code:'CASE_LOAD_FAILED',message:'Cases could not be loaded. Please retry or contact your administrator.'});
  const rows=data||[],documents=[];
  const documentSelect=CASE_SELECT.slice(CASE_SELECT.indexOf('documents!documents_case_id_fkey(')+'documents!documents_case_id_fkey('.length,-1);
  // Bound each relationship request and paginate children rather than silently
  // dropping documents at the Data API row limit. All reads use the user's RLS.
  for(let i=0;i<rows.length;i+=50){
    const ids=rows.slice(i,i+50).map(row=>row.id);
    for(let start=0;;start+=250){
      let children=viewer.from('documents').select('case_id,'+documentSelect).in('case_id',ids).order('id').range(start,start+249);
      if(!profile.is_platform_super_admin)children=children.eq('organization_id',profile.organization_id);
      const {data:docs,error:docsError}=await children;
      if(docsError)return apiError(docsError,{code:'CASE_LOAD_FAILED',message:'Case documents could not be loaded. Please retry.'});
      documents.push(...(docs||[]));
      if((docs||[]).length<250)break;
    }
  }
  const byCase=new Map(rows.map(row=>[row.id,[]]));
  for(const doc of documents)byCase.get(doc.case_id)?.push(doc);
  return apiJson({ok:true,cases:rows.map(row=>({...row,documents:byCase.get(row.id)||[]}))});
 }catch(error){return apiError(error,{code:'CASE_LOAD_FAILED',message:'Cases could not be loaded. Please retry.'})}
}
