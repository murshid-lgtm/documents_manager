// A retry keeps the same metadata ID and immutable storage path. Never delete
// metadata on an ambiguous upload response: the private object may already exist.
async function attempt(operation){try{return await operation()}catch(error){return {error}}}
function matches(row,expected){return row&&Object.keys(expected).every(key=>row[key]===expected[key])}
export async function uploadCustomerFile(client,draft){
 const {file,row}=draft;
 const inserted=await attempt(()=>client.from('customer_record_files').insert(row));
 if(inserted.error){
  const found=await attempt(()=>client.from('customer_record_files').select('*').eq('organization_id',row.organization_id).eq('customer_id',row.customer_id).eq('record_id',row.record_id).eq('id',row.id).maybeSingle());
  if(found.error)throw found.error;
  if(!matches(found.data,row))throw inserted.error;
 }
 const storage=client.storage.from('customer-records');
 const result=await attempt(()=>storage.upload(row.object_path,file,{contentType:row.content_type,upsert:false}));
 if(!result.error)return;
 // Upload may have committed before its response was lost. Read through the same
 // user's storage RLS, then compare content, not just a name or byte count.
 const existing=await attempt(()=>storage.download(row.object_path));
 if(existing.error||!existing.data)throw result.error;
 if(existing.data.size!==file.size)throw Error('The stored attachment differs from this file. Refresh the file list before continuing.');
 const [saved,selected]=await Promise.all([existing.data.arrayBuffer(),file.arrayBuffer()]);
 const [savedHash,selectedHash]=await Promise.all([crypto.subtle.digest('SHA-256',saved),crypto.subtle.digest('SHA-256',selected)]);
 const a=new Uint8Array(savedHash),b=new Uint8Array(selectedHash);
 if(a.length!==b.length||!a.every((value,index)=>value===b[index]))throw Error('The stored attachment differs from this file. Refresh the file list before continuing.');
}
