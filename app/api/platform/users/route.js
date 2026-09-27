import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export async function POST(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!publishable||!service)return NextResponse.json({error:'Server user-management credentials are not configured.'},{status:503});
    const token=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
    const viewer=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await viewer.auth.getUser(token);
    if(userError||!user)return NextResponse.json({error:'Invalid session.'},{status:401});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,organization_id,is_active,is_platform_super_admin').eq('id',user.id).single();
    if(actorError||!actor?.is_active||(!actor.is_platform_super_admin&&String(actor.role).toLowerCase()!=='admin'))return NextResponse.json({error:'Administrator access required.'},{status:403});
    const body=await request.json();
    const organizationId=String(body.organization_id||'');
    if(!organizationId)return NextResponse.json({error:'Company is required.'},{status:400});
    if(!actor.is_platform_super_admin&&organizationId!==actor.organization_id)return NextResponse.json({error:'Company access denied.'},{status:403});
    const role=['admin','staff','branch'].includes(String(body.role||'').toLowerCase())?String(body.role).toLowerCase():'staff';
    if(role==='branch'&&!body.branch_id)return NextResponse.json({error:'Select a branch for branch staff.'},{status:400});
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:String(body.email||'').trim().toLowerCase(),password:String(body.password||''),email_confirm:true,user_metadata:{full_name:String(body.full_name||'').trim()}});
    if(createError)return NextResponse.json({error:createError.message},{status:400});
    const {error:profileError}=await admin.from('profiles').upsert({id:created.user.id,full_name:String(body.full_name||'').trim(),role,branch_id:body.branch_id||null,organization_id:organizationId,is_active:true,is_platform_super_admin:false},{onConflict:'id'});
    if(profileError){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:profileError.message},{status:400})}
    return NextResponse.json({id:created.user.id,email:created.user.email});
  }catch(error){return NextResponse.json({error:error?.message||'Unable to create staff account.'},{status:500})}
}
