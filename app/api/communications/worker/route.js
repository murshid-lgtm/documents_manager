import {apiJson,apiError,constantTimeEqual,bearerToken} from '../../../../lib/serverSecurity';
import {communicationAdmin,workerToken,processCommunications} from '../../../../lib/communicationsServer';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
export async function POST(request){try{if(!constantTimeEqual(bearerToken(request),workerToken()))return apiJson({error:'Authentication required.'},401);const admin=communicationAdmin();const {error}=await admin.rpc('queue_customer_renewals');if(error)throw error;return apiJson({ok:true,result:await processCommunications(admin)})}catch(e){return apiError(e,{code:'WORKER_FAILED',message:'The communication worker is temporarily unavailable.'})}}
