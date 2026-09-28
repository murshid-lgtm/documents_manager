import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const runtime='nodejs';

const FIELD_BY_KIND={logo:'logo_url',favicon:'favicon_url',app_icon:'app_icon_url',login_background:'login_background_url'};
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon']);
const EXT_BY_TYPE={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/x-icon':'ico','image/vnd.microsoft.icon':'ico'};
const MAX_BYTES=5*1024*1024;

export async function POST(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!publishable||!service)return NextResponse.json({error:'Branding upload credentials are not configured.'},{status:503});

    const token=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
    const viewer=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await viewer.auth.getUser(token);
    if(userError||!user)return NextResponse.json({error:'Invalid session.'},{status:401});

    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,organization_id,is_active,is_platform_super_admin').eq('id',user.id).single();
    if(actorError||!actor?.is_active||(!actor.is_platform_super_admin&&String(actor.role).toLowerCase()!=='admin'))return NextResponse.json({error:'Administrator access required.'},{status:403});

    const form=await request.formData();
    const organizationId=String(form.get('organization_id')||'');
    const kind=String(form.get('kind')||'');
    const field=FIELD_BY_KIND[kind];
    const file=form.get('file');
    if(!organizationId||!field)return NextResponse.json({error:'Company and branding asset type are required.'},{status:400});
    if(!actor.is_platform_super_admin&&organizationId!==actor.organization_id)return NextResponse.json({error:'Company access denied.'},{status:403});
    if(!file||typeof file.arrayBuffer!=='function')return NextResponse.json({error:'Choose an image to upload.'},{status:400});
    if(!ALLOWED_TYPES.has(file.type))return NextResponse.json({error:'Use PNG, JPG, WebP, GIF or ICO images.'},{status:400});
    if(file.size>MAX_BYTES)return NextResponse.json({error:'Image must be 5 MB or smaller.'},{status:400});

    const {data:organization}=await admin.from('organizations').select('id').eq('id',organizationId).maybeSingle();
    if(!organization)return NextResponse.json({error:'Company was not found.'},{status:404});

    const bucket='branding-assets';
    const {data:existingBucket}=await admin.storage.getBucket(bucket);
    if(!existingBucket){const {error:createBucketError}=await admin.storage.createBucket(bucket,{public:true,fileSizeLimit:MAX_BYTES,allowedMimeTypes:[...ALLOWED_TYPES]});if(createBucketError&&!/already exists/i.test(createBucketError.message||''))return NextResponse.json({error:createBucketError.message},{status:400})}
    else if(!existingBucket.public){await admin.storage.updateBucket(bucket,{public:true,fileSizeLimit:MAX_BYTES,allowedMimeTypes:[...ALLOWED_TYPES]})}

    const extension=EXT_BY_TYPE[file.type]||'png';
    const path=`${organizationId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const buffer=Buffer.from(await file.arrayBuffer());
    const {error:uploadError}=await admin.storage.from(bucket).upload(path,buffer,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(uploadError)return NextResponse.json({error:uploadError.message},{status:400});
    const {data:publicData}=admin.storage.from(bucket).getPublicUrl(path);
    const publicUrl=publicData?.publicUrl;
    const {data:saved,error:saveError}=await admin.from('organization_settings').update({[field]:publicUrl,updated_by:user.id,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('*').maybeSingle();
    if(saveError||!saved){await admin.storage.from(bucket).remove([path]);return NextResponse.json({error:saveError?.message||'Company settings were not found.'},{status:400})}
    return NextResponse.json({url:publicUrl,field,settings:saved});
  }catch(error){return NextResponse.json({error:error?.message||'Unable to upload branding image.'},{status:500})}
}
