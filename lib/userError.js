const text=value=>String(value??'').trim();

function rawError(error){
  if(typeof error==='string')return error;
  return [error?.message,error?.details,error?.hint].map(text).filter(Boolean).join(' ');
}

function duplicateValue(raw){
  const direct=raw.match(/tracking_reference\s*\)?\s*=\s*\(?[^,)]*,?\s*([^,)]+)\)?/i);
  if(direct?.[1])return text(direct[1]).replace(/^['"]|['"]$/g,'');
  const keyValue=raw.match(/Key\s*\([^)]*tracking_reference[^)]*\)\s*=\s*\(([^)]+)\)/i);
  if(keyValue?.[1])return text(keyValue[1].split(',').pop()).replace(/^['"]|['"]$/g,'');
  return '';
}

export function userError(error,context={}){
  const suppliedString=typeof error==='string';
  const raw=rawError(error);
  if(!raw)return 'Something went wrong. Please try again.';
  if(/^Tracking number .*already exists for this company\./i.test(raw))return raw;
  const lower=raw.toLowerCase();
  const code=text(error?.code);

  if(code==='P0001'&&/^(Payment exceeds the outstanding|Payments can only be recorded|Payments are permanent|An invoice with payments|Enter a reason of at least|Complete the stages|The company plan limit|Add a description for every item|Enter valid quantities and prices|Discount cannot exceed|Select an active branch|This customer is not available|Choose an invoice available|Enter a valid customer email|Every stage needs|Checkout is not available|Choose an active branch|Add at least one service|Choose an available service|Enter valid quantities and fees|Service jobs require|Payment cannot exceed|Add at least one document|Enter valid document names|Enter a valid stage name|Recording a payment requires|Service creation is not available|Enter a service name|Customer creation requires|Enter a bill number|Invoices with payments cannot|Accounting access denied|Only a company administrator can|Choose a supplier|Choose a bill available|Enter valid amounts|Choose an available cash|Choose two different|A paid bill cannot|Posted invoices cannot|Choose a valid document template|Choose a supported paper|Choose a font size|Template text is too long)/.test(error?.message||''))return error.message;

  if(code==='23505'||/duplicate key|unique constraint|already exists/i.test(raw)){
    const trackingConflict=/tracking_reference|cases_organization_id_tracking_reference_key/i.test(raw)||context.type==='tracking';
    if(trackingConflict){
      const reference=text(context.trackingReference)||duplicateValue(raw);
      return `${reference?`Tracking number “${reference}”`:'This tracking number'} already exists for this company. Open the existing case and add the document there, or use a different tracking number.`;
    }
    if(/sales_documents.*document_no|organization_id_document_no/i.test(raw))return 'This bill number already exists in your company. Open the existing invoice or enter a different bill number.';
    if(/branches.*name|branch.*unique/i.test(raw))return 'A branch with this name already exists. Use the existing branch or enter a different branch name.';
    return 'This record already exists. Review the existing record or enter a different value.';
  }

  if(code==='42501'||/row-level security|violates row-level security|permission denied|not authorized|access denied/i.test(raw))return 'You do not have permission to complete this action. Check that you are signed into the correct company and that your staff role allows it.';
  if(code==='23503'||/foreign key constraint/i.test(raw))return 'This item is linked to another record and cannot be changed or removed yet. Remove the related record first, then try again.';
  if(code==='23502'||/not-null constraint|null value in column/i.test(raw))return 'Required information is missing. Complete all required fields and try again.';
  if(code==='23514'||/check constraint/i.test(raw))return 'One of the entered values is not allowed. Review the form fields and try again.';
  if(code==='22P02'||/invalid input syntax|invalid uuid|malformed/i.test(raw))return 'One of the entered values has an invalid format. Check the selected record and entered numbers, then try again.';
  if(code==='PGRST116'||/json object requested|0 rows|no rows returned/i.test(raw))return 'The requested record could not be found. Refresh the page and try again.';
  if(/schema cache|could not find the .* column|could not find the function|relation .* does not exist|column .* does not exist/i.test(raw))return 'This feature is not fully configured in the database yet. Ask the system administrator to apply the latest database update.';
  if(/failed to fetch|networkerror|network request failed|load failed|connection|timeout|timed out/i.test(lower))return 'The server could not be reached. Check your internet connection and try again.';
  if(/invalid login credentials|email not confirmed/i.test(lower))return lower.includes('email not confirmed')?'Your email address is not confirmed yet. Open the confirmation email, then sign in again.':'The email address or password is incorrect. Check both and try again.';
  if(/rate limit|too many requests/i.test(lower))return 'Too many attempts were made. Wait a moment, then try again.';
  if(/jwt|session.*expired|refresh token/i.test(lower))return 'Your session has expired. Sign in again to continue.';

  const looksTechnical=/sql|postgres|supabase|pgrst|constraint|violates|operator does not exist|function public\.|error code|stack|syntax error/i.test(raw);
  if(looksTechnical)return 'The action could not be completed because of a system configuration problem. Try again, and contact the system administrator if it continues.';
  if(suppliedString)return raw;
  return context.fallback||'The action could not be completed. Please try again. If it continues, contact your system administrator.';
}

export default userError;
