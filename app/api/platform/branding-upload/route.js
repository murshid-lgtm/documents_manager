import {createClient} from '@supabase/supabase-js';
import {checkPortal} from '../../../../lib/portalAccess';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {apiError,apiJson,bearerToken,hasLiveSession,consumeRateLimit} from '../../../../lib/serverSecurity';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const FIELD_BY_KIND={logo:'logo_url',favicon:'favicon_url',app_icon:'app_icon_url',login_background:'login_background_url'};
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const MAX_BYTES=5*1024*1024;

export async function POST(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
    const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
    const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
    if(!url||!publishable||!service)return apiJson({ok:false,error:'Branding uploads are temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);

    const token=bearerToken(request);
    if(!token)return apiJson({ok:false,error:'Authentication required.',code:'AUTH_REQUIRED'},401);
    const viewer=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userAuthError}=await viewer.auth.getUser(token);
    if(userAuthError||!user)return apiJson({ok:false,error:'Your session is invalid or expired.',code:'INVALID_SESSION'},401);
    if(!await hasLiveSession(viewer))return apiJson({ok:false,error:'Your session is invalid or expired.',code:'INVALID_SESSION'},401);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,organization_id,is_active,is_platform_super_admin').eq('id',user.id).single();
    if(actorError||!actor?.is_active||(!actor.is_platform_super_admin&&String(actor.role).toLowerCase()!=='admin'))return apiJson({ok:false,error:'Administrator access required.',code:'FORBIDDEN'},403);
    const denied=await checkPortal(admin,actor,request);
    if(denied)return denied;
    const rate=await consumeRateLimit(admin,{bucket:'branding-upload',key:user.id,limit:20,windowSeconds:3600});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Security controls are temporarily unavailable.':'Too many uploads. Please try again later.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'3600'});

    const form=await request.formData();
    const organizationId=String(form.get('organization_id')||'');
    const kind=String(form.get('kind')||'');
    const field=FIELD_BY_KIND[kind];
    const file=form.get('file');
    if(!organizationId||!field)return apiJson({ok:false,error:'Company and branding asset type are required.',code:'INVALID_INPUT'},400);
    if(!actor.is_platform_super_admin&&organizationId!==actor.organization_id)return apiJson({ok:false,error:'You cannot update branding for this company.',code:'FORBIDDEN'},403);
    if(!file||typeof file.arrayBuffer!=='function')return apiJson({ok:false,error:'Choose an image to upload.',code:'FILE_REQUIRED'},400);
    if(!ALLOWED_TYPES.has(file.type))return apiJson({ok:false,error:'Use a PNG, JPG or WebP image.',code:'INVALID_FILE_TYPE'},400);
    if(file.size>MAX_BYTES)return apiJson({ok:false,error:'Image must be 5 MB or smaller.',code:'FILE_TOO_LARGE'},400);

    const {data:organization,error:organizationError}=await admin.from('organizations').select('id,status').eq('id',organizationId).maybeSingle();
    if(organizationError)throw organizationError;
    if(organization&&organization.status!=='Active'&&!actor.is_platform_super_admin)return apiJson({ok:false,error:'This company account is unavailable.',code:'FORBIDDEN'},403);
    if(!organization)return apiJson({ok:false,error:'Company was not found.',code:'NOT_FOUND'},404);

    const source=Buffer.from(await file.arrayBuffer());
    let metadata;
    try{metadata=await sharp(source,{failOn:'error',limitInputPixels:20_000_000}).metadata()}catch(error){return apiJson({ok:false,error:'The selected file is not a valid image.',code:'INVALID_IMAGE'},400)}
    if(!['png','jpeg','webp'].includes(metadata.format)||!metadata.width||!metadata.height)return apiJson({ok:false,error:'The selected file is not a supported image.',code:'INVALID_IMAGE'},400);
    if(metadata.width>6000||metadata.height>6000)return apiJson({ok:false,error:'Image dimensions must not exceed 6000 × 6000 pixels.',code:'IMAGE_TOO_LARGE'},400);

    const maxDimension=kind==='login_background'?2400:1400;
    let pipeline=sharp(source,{failOn:'error',limitInputPixels:20_000_000}).rotate().resize({width:maxDimension,height:maxDimension,fit:'inside',withoutEnlargement:true});
    const useWebp=kind==='login_background';
    const output=useWebp?await pipeline.webp({quality:88,effort:5}).toBuffer():await pipeline.png({compressionLevel:9,palette:false}).toBuffer();
    const outputType=useWebp?'image/webp':'image/png',extension=useWebp?'webp':'png';

    const bucket='branding-assets',allowedMimeTypes=['image/png','image/webp'];
    const {data:existingBucket,error:bucketError}=await admin.storage.getBucket(bucket);
    if(bucketError&&!/not found/i.test(bucketError.message||''))throw bucketError;
    if(!existingBucket){
      const {error:createBucketError}=await admin.storage.createBucket(bucket,{public:true,fileSizeLimit:MAX_BYTES,allowedMimeTypes});
      if(createBucketError&&!/already exists/i.test(createBucketError.message||''))throw createBucketError;
    }else{
      const {error:updateBucketError}=await admin.storage.updateBucket(bucket,{public:true,fileSizeLimit:MAX_BYTES,allowedMimeTypes});
      if(updateBucketError)throw updateBucketError;
    }

    const path=`${organizationId}/${kind}-${Date.now()}-${randomUUID()}.${extension}`;
    const {error:uploadError}=await admin.storage.from(bucket).upload(path,output,{contentType:outputType,cacheControl:'31536000',upsert:false});
    if(uploadError)throw uploadError;
    const {data:publicData}=admin.storage.from(bucket).getPublicUrl(path);
    const publicUrl=publicData?.publicUrl;
    const {data:saved,error:saveError}=await admin.from('organization_settings').update({[field]:publicUrl,updated_by:user.id,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('*').maybeSingle();
    if(saveError||!saved){
      await admin.storage.from(bucket).remove([path]);
      if(saveError)throw saveError;
      return apiJson({ok:false,error:'Company branding settings were not found.',code:'SETTINGS_NOT_FOUND'},404);
    }
    return apiJson({ok:true,url:publicUrl,field,settings:saved});
  }catch(error){
    return apiError(error,{code:'BRANDING_UPLOAD_FAILED',message:'Unable to upload the branding image.'});
  }
}
