// Each pair binds an ID to the version shown in the schedule. Chunking avoids
// oversized REST URLs and keeps returned records below the API row limit.
export async function updateAppointmentsSafely(client,snapshots,patch){
 const saved=[];
 try{
  for(let offset=0;offset<snapshots.length;offset+=30){
   const chunk=snapshots.slice(offset,offset+30);
   const filters=chunk.map(row=>{
    if(!/^[0-9a-f-]{36}$/i.test(row.id))throw 'An appointment is unavailable. Refresh the schedule before retrying.';
    const version=row.updated_at;
    if(version!==null&&version!==undefined&&(!/^\d{4}-\d\d-\d\d[T ][\d:.+Z -]+$/.test(version)||!Number.isFinite(Date.parse(version))))throw 'An appointment version is unavailable. Refresh the schedule before retrying.';
    return `and(id.eq.${row.id},${version?`updated_at.eq.${JSON.stringify(version)}`:'updated_at.is.null'})`;
   });
   const result=await client.from('appointments').update(patch).or(filters.join(',')).select('id');
   if(result.error)throw result.error;
   if(!Array.isArray(result.data))throw 'The save result could not be confirmed. Refresh appointments before retrying.';
   const requested=new Set(chunk.map(row=>row.id));
   for(const row of result.data)if(requested.has(row.id))saved.push(row.id);
  }
  return {saved,error:null};
 }catch(error){return {saved,error}}
}
