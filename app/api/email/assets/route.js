import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {apiJson,apiError,isSameOrigin} from '../../../../lib/serverSecurity';
import {communicationContext,communicationRate} from '../../../../lib/communicationsServer';
export const runtime='nodejs';export const dynamic='force-dynamic';
const MAX=3*1024*1024;
export async function POST(request){try{
 if(!isSameOrigin(request))return apiJson({error:'Request origin was not accepted.'},403);
 const size=Number(request.headers.get('content-length'));if(!Number.isFinite(size)||size<=0||size>MAX+16384)return apiJson({error:'Choose an image up to 3 MB.'},413);
 const org=new URL(request.url).searchParams.get('organization_id');const ctx=await communicationContext(request,org);if(ctx.response)return ctx.response;
 const {admin,profile,organizationId}=ctx;if(!(await communicationRate(admin,profile.id,'email-image-upload')).allowed)return apiJson({error:'Please wait before uploading another image.'},429);
 const form=await request.formData(),file=form.get('file');if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX||!file.size)return apiJson({error:'Choose a PNG, JPG or WebP image up to 3 MB.'},400);
 let output;try{const pipeline=sharp(Buffer.from(await file.arrayBuffer()),{failOn:'error',limitInputPixels:20_000_000});const meta=await pipeline.metadata();if(!['png','jpeg','webp'].includes(meta.format)||!meta.width||!meta.height||meta.width>6000||meta.height>6000)throw Error();output=await pipeline.rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer()}catch{return apiJson({error:'The file is not a supported image, or exceeds 6000 × 6000 pixels.'},400)}
 if(output.length>MAX)return apiJson({error:'Choose a smaller image.'},400);
 // Public branded artwork only; no private customer documents are stored here.
 const bucket='branding-assets',path=`${organizationId}/email/${randomUUID()}.png`;
 const {data:existing,error:lookup}=await admin.storage.getBucket(bucket);if(lookup&&!/not found/i.test(lookup.message||''))throw lookup;
 if(!existing){const {error}=await admin.storage.createBucket(bucket,{public:true,fileSizeLimit:MAX,allowedMimeTypes:['image/png','image/webp']});if(error&&!/already exists/i.test(error.message||''))throw error}
 else if(!existing.public)return apiJson({error:'Public branding storage must be configured by the platform administrator.'},503);
 const {error}=await admin.storage.from(bucket).upload(path,output,{contentType:'image/png',cacheControl:'31536000',upsert:false});if(error)throw error;
 return apiJson({url:admin.storage.from(bucket).getPublicUrl(path).data.publicUrl});
}catch(e){return apiError(e,{code:'EMAIL_IMAGE_UPLOAD',message:'The banner could not be uploaded.'})}}
