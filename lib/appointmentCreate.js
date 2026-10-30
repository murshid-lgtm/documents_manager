// Keep one set of record IDs until the caller has confirmed the result.
// Insert conflicts never update an existing booking.
export async function createAppointmentsOnce(client,requestRef,rows){
 const signature=JSON.stringify(rows);
 if(requestRef.current&&requestRef.current.signature!==signature)throw 'A previous appointment save is unconfirmed. Restore the original values and retry to check that save before starting another booking.';
 if(!requestRef.current)requestRef.current={signature,rows:rows.map(row=>({...row,id:crypto.randomUUID()}))};
 const pending=requestRef.current.rows;
 const result=await client.from('appointments').upsert(pending,{onConflict:'id',ignoreDuplicates:true});
 if(result.error)throw result.error;
 const ids=pending.map(row=>row.id),confirmed=new Set();
 for(let start=0;start<ids.length;start+=200){
  const check=await client.from('appointments').select('id').in('id',ids.slice(start,start+200));
  if(check.error)throw check.error;
  for(const row of check.data||[])confirmed.add(row.id);
 }
 if(!ids.every(id=>confirmed.has(id)))throw 'The appointment save could not be confirmed. Keep this editor open and retry with the same values.';
 requestRef.current=null;
 return ids;
}
