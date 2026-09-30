import {validateStaffModules,validateStaffPassword} from '../../../../lib/modules';
import {checkPortal} from '../../../../lib/portalAccess';
import {canManageAccount} from '../../../../lib/portalPolicy';
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
  const denied=await checkPortal(admin,actor,request);
  if(denied)return {response:denied};
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
    const rate=await consumeRateLimit(admin,{bucket:'staff-create',key:user.id,limit:10,windowSeconds:3600});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Security controls are temporarily unavailable.':'Too many staff accounts created. Please try again later.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'3600'});

    const body=await readJson(request);
    const organizationId=String(body.organization_id||'');
    const email=String(body.email||'').trim().toLowerCase();
    const fullName=String(body.full_name||'').trim().slice(0,120);
    const role=['admin','staff','branch'].includes(String(body.role||'').toLowerCase())?String(body.role).toLowerCase():'staff';
    const branchId=body.branch_id?String(body.branch_id):null;
    const password=validateStaffPassword(body.password);
    const staffModules=Object.hasOwn(body,'staff_modules')?validateStaffModules(body.staff_modules):null;
    if(!organizationId||!emailPattern.test(email)||!fullName)return apiJson({ok:false,error:'Company, staff name and a valid email address are required.',code:'INVALID_INPUT'},400);
    if(!actor.is_platform_super_admin&&organizationId!==actor.organization_id)return apiJson({ok:false,error:'You cannot manage staff for this company.',code:'FORBIDDEN'},403);
    if(role==='admin'&&!actor.is_platform_super_admin)return apiJson({ok:false,error:'Only the platform owner can create company administrators.',code:'FORBIDDEN'},403);
    if(role==='branch'&&!branchId)return apiJson({ok:false,error:'Select a branch for branch staff.',code:'BRANCH_REQUIRED'},400);
    if(branchId&&!await validBranch(admin,organizationId,branchId))return apiJson({ok:false,error:'Select an active branch belonging to this company.',code:'INVALID_BRANCH'},400);

    const {data:org}=await admin.from('organizations').select('status').eq('id',organizationId).maybeSingle();
    if(org?.status!=='Active')return apiJson({ok:false,error:'Select an active company.',code:'INVALID_COMPANY'},400);
    const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
    if(createError){
      if(/already|registered|exists/i.test(createError.message||''))return apiJson({ok:false,error:'An account already exists for this email address.',code:'EMAIL_EXISTS'},409);
      return apiError(createError,{status:400,code:'STAFF_CREATE_FAILED',message:'The staff account could not be created. Check the password requirements and try again.'});
    }
    const {error:profileError}=await admin.from('profiles').upsert({id:created.user.id,full_name:fullName,role,staff_modules:staffModules,branch_id:branchId,organization_id:organizationId,is_active:true,is_platform_super_admin:false},{onConflict:'id'});
    if(profileError){
      await admin.auth.admin.deleteUser(created.user.id);
      return apiError(profileError,{status:400,code:'PROFILE_CREATE_FAILED',message:'The staff profile could not be created.'});
    }
    return apiJson({ok:true,id:created.user.id,email:created.user.email,message:'Staff account created.'},201);
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'STAFF_CREATE_FAILED',message:error?.code==='INVALID_PASSWORD'?'Use a password between 12 and 128 characters.':error?.code==='INVALID_MODULES'?'Select valid staff modules.':error?.status===413?'The request is too large.':'Unable to create the staff account.'});
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
    if(!canManageAccount(actor,target))return apiJson({ok:false,error:'You cannot change this account. Company administrators are managed by the platform owner.',code:'FORBIDDEN'},403);
    const {data:identity,error:identityError}=await admin.auth.admin.getUserById(targetId);
    if(identityError||!identity.user||identity.user.deleted_at)return apiJson({ok:false,error:'This account is no longer available.',code:'NOT_FOUND'},404);

    const newPassword=Object.hasOwn(body,'new_password')?validateStaffPassword(body.new_password):null;
    const updates={};
    if(Object.hasOwn(body,'staff_modules'))updates.staff_modules=validateStaffModules(body.staff_modules);
    if(Object.hasOwn(body,'full_name'))updates.full_name=String(body.full_name||'').trim().slice(0,120);
    if(Object.hasOwn(updates,'full_name')&&!updates.full_name)return apiJson({ok:false,error:'Enter the account holder’s name.',code:'INVALID_INPUT'},400);
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
    if(targetId===user.id&&updates.role&&updates.role!==target.role)return apiJson({ok:false,error:'You cannot change your own role.',code:'SELF_ROLE_CHANGE'},400);
    const newEmail=Object.hasOwn(body,'email')?String(body.email||'').trim().toLowerCase():null;
    if(newEmail!==null&&!emailPattern.test(newEmail))return apiJson({ok:false,error:'Enter a valid email address.',code:'INVALID_EMAIL'},400);
    if(newEmail&&newEmail!==identity.user.email){
      const {error:emailError}=await admin.auth.admin.updateUserById(targetId,{email:newEmail,email_confirm:true});
      if(emailError)return apiError(emailError,{status:409,code:'EMAIL_UPDATE_FAILED',message:'This email cannot be used. It may already belong to another account.'});
    }
    if(newPassword){
      const passwordRate=await consumeRateLimit(admin,{bucket:'staff-password',key:user.id,limit:10,windowSeconds:3600});
      if(!passwordRate.allowed)return apiJson({ok:false,error:'Password changes are temporarily unavailable. Please try again later.',code:'RATE_LIMITED'},429);
      const {error:passwordError}=await admin.auth.admin.updateUserById(targetId,{password:newPassword,email_confirm:true});
      if(passwordError)return apiError(passwordError,{status:400,code:'PASSWORD_UPDATE_FAILED',message:'The password could not be changed. Check the password requirements and try again.'});
    }
    if((newPassword||newEmail)&&!Object.keys(updates).length)return apiJson({ok:true,id:targetId,message:'Account updated.'});
    if(!Object.keys(updates).length)return apiJson({ok:true,id:targetId,message:'No changes were needed.'});
    updates.updated_at=new Date().toISOString();
    const {error:updateError}=await admin.from('profiles').update(updates).eq('id',targetId);
    if(updateError)return apiError(updateError,{status:400,code:'PROFILE_UPDATE_FAILED',message:'The staff account could not be updated.'});
    return apiJson({ok:true,id:targetId,message:'Staff account updated.'});
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'STAFF_UPDATE_FAILED',message:error?.code==='INVALID_PASSWORD'?'Use a password between 12 and 128 characters.':error?.status===413?'The request is too large.':'Unable to update the staff account.'});
  }
}

export async function GET(request){
 try{
  const ctx=await context(request);if(ctx.response)return ctx.response;
  const {admin,actor}=ctx;
  const organizationId=new URL(request.url).searchParams.get('organization_id')||actor.organization_id;
  if(!organizationId||(!actor.is_platform_super_admin&&organizationId!==actor.organization_id))return apiJson({ok:false,error:'You cannot view accounts for this company.',code:'FORBIDDEN'},403);
  const {data:rows,error}=await admin.from('profiles').select('id,full_name,role,branch_id,is_active,organization_id,is_platform_super_admin,staff_modules').eq('organization_id',organizationId).order('full_name').limit(500);
  if(error)throw error;
  const accounts=[];
  for(let start=0;start<(rows||[]).length;start+=10){
   const batch=await Promise.all(rows.slice(start,start+10).map(async profile=>{
    const {data,error}=await admin.auth.admin.getUserById(profile.id);
    if(error?.status===404||data?.user?.deleted_at)return null;
    if(error)throw error;
    return {...profile,email:data?.user?.email||''};
   }));
   accounts.push(...batch.filter(Boolean));
  }
  return apiJson({ok:true,accounts});
 }catch(error){return apiError(error,{message:'Accounts could not be loaded. Please retry.',code:'ACCOUNT_LIST_FAILED'})}
}

export async function DELETE(request){
 try{
  const ctx=await context(request);if(ctx.response)return ctx.response;
  const {admin,actor,user}=ctx;
  const body=await readJson(request),targetId=String(body.id||'');
  if(!targetId||targetId===user.id)return apiJson({ok:false,error:'You cannot delete your own account.',code:'INVALID_ACCOUNT'},400);
  const {data:target,error}=await admin.from('profiles').select('id,role,organization_id,is_active,is_platform_super_admin').eq('id',targetId).maybeSingle();
  if(error)throw error;
  if(!target)return apiJson({ok:false,error:'Account not found.',code:'NOT_FOUND'},404);
  if(!canManageAccount(actor,target))return apiJson({ok:false,error:'You cannot delete this account.',code:'FORBIDDEN'},403);
  const rate=await consumeRateLimit(admin,{bucket:'account-delete',key:user.id,limit:10,windowSeconds:3600});
  if(!rate.allowed)return apiJson({ok:false,error:'Account deletion is temporarily unavailable. Please retry later.',code:'RATE_LIMITED'},429);
  // Disable RLS access first, then soft-delete Auth identity. Historical actor
  // references remain intact; the account can no longer sign in.
  const {error:disableError}=await admin.from('profiles').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',targetId);
  if(disableError)throw disableError;
  const {error:deleteError}=await admin.auth.admin.deleteUser(targetId,true);
  if(deleteError)return apiError(deleteError,{message:'The account was disabled, but deletion could not finish. Please retry.',code:'ACCOUNT_DELETE_FAILED'});
  return apiJson({ok:true,message:'Account deleted. Business records were preserved.'});
 }catch(error){return apiError(error,{message:'The account could not be deleted.',code:'ACCOUNT_DELETE_FAILED'})}
}
