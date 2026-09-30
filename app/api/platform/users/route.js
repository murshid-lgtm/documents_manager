import {validateStaffModules} from '../../../../lib/modules';
import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,bearerToken,hasLiveSession,consumeRateLimit,readJson} from '../../../../lib/serverSecurity';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function context(request){
  if(!url||!publishable||!service)return {response:apiJson({ok:false,error:'User management is temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503)};
  const token=bearerToken(request);
  if(!token)return {response:apiJson({ok:false,error:'Authentication required.',code:'AUTH_REQUIRED'},401)};
  const viewer=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await viewer.auth.getUser(token);
  if(userError||!user)return {response:apiJson({ok:false,error:'Your session is invalid or expired.',code:'INVALID_SESSION'},401)};
  if(!await hasLiveSession(viewer))return {response:apiJson({ok:false,error:'Your session is invalid or expired.',code:'INVALID_SESSION'},401)};
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,organization_id,is_active,is_platform_super_admin').eq('id',user.id).single();
  if(actorError||!actor?.is_active||(!actor.is_platform_super_admin&&String(actor.role).toLowerCase()!=='admin'))return {response:apiJson({ok:false,error:'Administrator access required.',code:'FORBIDDEN'},403)};
  if(!actor.is_platform_super_admin){const {data:org}=await admin.from('organizations').select('status').eq('id',actor.organization_id).maybeSingle();if(org?.status!=='Active')return {response:apiJson({ok:false,error:'This company account is unavailable.',code:'FORBIDDEN'},403)}}
  return {admin,actor,user};
}

async function validBranch(admin,organizationId,branchId){
  if(!branchId)return true;
  const {data,error}=await admin.from('branches').select('id').eq('id',branchId).eq('organization_id',organizationId).eq('is_active',true).maybeSingle();
  if(error)throw error;
  return Boolean(data);
}

export async function POST(request){
  try{
    const ctx=await context(request);
    if(ctx.response)return ctx.response;
    const {admin,actor,user}=ctx;
    const rate=await consumeRateLimit(admin,{bucket:'staff-invite',key:user.id,limit:10,windowSeconds:3600});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Security controls are temporarily unavailable.':'Too many invitations. Please try again later.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'3600'});

    const body=await readJson(request);
    const organizationId=String(body.organization_id||'');
    const email=String(body.email||'').trim().toLowerCase();
    const fullName=String(body.full_name||'').trim().slice(0,120);
    const role=['admin','staff','branch'].includes(String(body.role||'').toLowerCase())?String(body.role).toLowerCase():'staff';
    const branchId=body.branch_id?String(body.branch_id):null;
    const staffModules=Object.hasOwn(body,'staff_modules')?validateStaffModules(body.staff_modules):null;
    if(!organizationId||!emailPattern.test(email)||!fullName)return apiJson({ok:false,error:'Company, staff name and a valid email address are required.',code:'INVALID_INPUT'},400);
    if(!actor.is_platform_super_admin&&organizationId!==actor.organization_id)return apiJson({ok:false,error:'You cannot manage staff for this company.',code:'FORBIDDEN'},403);
    if(role==='admin'&&!actor.is_platform_super_admin)return apiJson({ok:false,error:'Only the platform owner can create company administrators.',code:'FORBIDDEN'},403);
    if(role==='branch'&&!branchId)return apiJson({ok:false,error:'Select a branch for branch staff.',code:'BRANCH_REQUIRED'},400);
    if(branchId&&!await validBranch(admin,organizationId,branchId))return apiJson({ok:false,error:'Select an active branch belonging to this company.',code:'INVALID_BRANCH'},400);

    const appOrigin=process.env.APP_ORIGIN||process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
    if(!appOrigin)return apiJson({ok:false,error:'Staff invitations are not configured yet.',code:'SERVICE_NOT_CONFIGURED'},503);
    const {data:org}=await admin.from('organizations').select('status').eq('id',organizationId).maybeSingle();
    if(org?.status!=='Active')return apiJson({ok:false,error:'Select an active company.',code:'INVALID_COMPANY'},400);
    const redirectTo=new URL('/?mode=setup',appOrigin).toString();
    const {data:created,error:createError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name:fullName}});
    if(createError){
      if(/already|registered|exists/i.test(createError.message||''))return apiJson({ok:false,error:'An account already exists for this email address.',code:'EMAIL_EXISTS'},409);
      return apiError(createError,{status:400,code:'INVITE_FAILED',message:'The staff invitation could not be sent.'});
    }
    const {error:profileError}=await admin.from('profiles').upsert({id:created.user.id,full_name:fullName,role,staff_modules:staffModules,branch_id:branchId,organization_id:organizationId,is_active:true,is_platform_super_admin:false},{onConflict:'id'});
    if(profileError){
      await admin.auth.admin.deleteUser(created.user.id);
      return apiError(profileError,{status:400,code:'PROFILE_CREATE_FAILED',message:'The staff profile could not be created.'});
    }
    return apiJson({ok:true,id:created.user.id,email:created.user.email,message:'Invitation sent.'},201);
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'STAFF_CREATE_FAILED',message:error?.code==='INVALID_MODULES'?'Select valid staff modules.':error?.status===413?'The request is too large.':'Unable to create the staff account.'});
  }
}

export async function PATCH(request){
  try{
    const ctx=await context(request);
    if(ctx.response)return ctx.response;
    const {admin,actor,user}=ctx;
    const rate=await consumeRateLimit(admin,{bucket:'staff-update',key:user.id,limit:30,windowSeconds:60});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Security controls are temporarily unavailable.':'Too many changes. Please try again shortly.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'60'});
    const body=await readJson(request);
    const targetId=String(body.id||'');
    if(!targetId)return apiJson({ok:false,error:'Select a staff account.',code:'INVALID_INPUT'},400);
    const {data:target,error:targetError}=await admin.from('profiles').select('id,organization_id,role,branch_id,is_platform_super_admin').eq('id',targetId).maybeSingle();
    if(targetError)throw targetError;
    if(!target)return apiJson({ok:false,error:'Staff account was not found.',code:'NOT_FOUND'},404);
    if(target.is_platform_super_admin&&!actor.is_platform_super_admin)return apiJson({ok:false,error:'Platform owner accounts cannot be changed here.',code:'FORBIDDEN'},403);
    if(!actor.is_platform_super_admin&&(target.organization_id!==actor.organization_id||target.role==='admin'))return apiJson({ok:false,error:'You cannot change this account.',code:'FORBIDDEN'},403);

    const updates={};
    if(Object.hasOwn(body,'staff_modules'))updates.staff_modules=validateStaffModules(body.staff_modules);
    if(Object.hasOwn(body,'full_name'))updates.full_name=String(body.full_name||'').trim().slice(0,120);
    if(Object.hasOwn(body,'is_active'))updates.is_active=Boolean(body.is_active);
    if(Object.hasOwn(body,'role')){
      const role=String(body.role||'').toLowerCase();
      if(!['admin','staff','branch'].includes(role))return apiJson({ok:false,error:'Select a valid staff role.',code:'INVALID_ROLE'},400);
      if(role==='admin'&&!actor.is_platform_super_admin)return apiJson({ok:false,error:'Only the platform owner can assign administrators.',code:'FORBIDDEN'},403);
      updates.role=role;
    }
    if(Object.hasOwn(body,'branch_id'))updates.branch_id=body.branch_id?String(body.branch_id):null;
    const finalRole=updates.role||target.role;
    const finalBranch=Object.hasOwn(updates,'branch_id')?updates.branch_id:target.branch_id;
    if(finalRole==='branch'&&!finalBranch)return apiJson({ok:false,error:'Select a branch for branch staff.',code:'BRANCH_REQUIRED'},400);
    if(updates.branch_id&&!await validBranch(admin,target.organization_id,updates.branch_id))return apiJson({ok:false,error:'Select an active branch belonging to this company.',code:'INVALID_BRANCH'},400);
    if(targetId===user.id&&updates.is_active===false)return apiJson({ok:false,error:'You cannot deactivate your own account.',code:'SELF_DEACTIVATION'},400);
    if(!Object.keys(updates).length)return apiJson({ok:true,id:targetId,message:'No changes were needed.'});
    updates.updated_at=new Date().toISOString();
    const {error:updateError}=await admin.from('profiles').update(updates).eq('id',targetId);
    if(updateError)return apiError(updateError,{status:400,code:'PROFILE_UPDATE_FAILED',message:'The staff account could not be updated.'});
    return apiJson({ok:true,id:targetId,message:'Staff account updated.'});
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'STAFF_UPDATE_FAILED',message:error?.status===413?'The request is too large.':'Unable to update the staff account.'});
  }
}
