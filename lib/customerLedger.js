// Customer statement: issued invoices and their actual receipts only.
export function customerLedger(documents,payments){
 const issued=documents.filter(d=>d.kind==='Invoice'&&d.status==='Issued'),ids=new Set(issued.map(d=>d.id));
 const entries=[...issued.map(d=>({id:`invoice-${d.id}`,date:d.created_at,reference:d.document_no,type:'Invoice',debit:Number(d.total||0),credit:0,record:d})),...payments.filter(p=>!p.voided&&ids.has(p.document_id)).map(p=>({id:`payment-${p.id}`,date:p.received_at,reference:p.receipt_no||p.reference||'Receipt',type:'Receipt',debit:0,credit:Number(p.amount||0),record:p}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id.localeCompare(b.id));
 let balance=0;return entries.map(row=>({...row,balance:balance=Math.round((balance+row.debit-row.credit)*100)/100}));
}
