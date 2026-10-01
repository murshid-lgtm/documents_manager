// External company sites resolve their tenant in the WordPress connector.
// The built-in tracker still requires explicit tenant context.
export function trackingLink({base,origin='',reference='',token='',organization=''}){
  const ref=String(reference||'').trim();
  const configured=String(base||'').trim();
  const fallback=`${origin}/public-track`;
  let url;
  try{url=new URL(configured||fallback,origin||'https://tracker.invalid')}catch{return ''}
  if(!['https:','http:'].includes(url.protocol))return '';
  if(url.pathname.replace(/\/$/,'')==='/public-track'){
    url.searchParams.set('ref',ref);
    if(token)url.searchParams.set('token',token);
    if(organization)url.searchParams.set('org',organization);
  }else{
    url.searchParams.delete('org');url.searchParams.delete('token');
    if(configured.includes('{ref}'))return configured.replace('{ref}',encodeURIComponent(ref));
    if(url.searchParams.has('ref')||!/^[a-zA-Z0-9._-]+$/.test(ref))url.searchParams.set('ref',ref);
    else url.pathname=`${url.pathname.replace(/\/$/,'')}/${encodeURIComponent(ref)}`;
  }
  return url.toString();
}

export function receiptBlob(dataUrl){
  const match=/^data:(image\/png);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if(!match)throw new Error('Invalid tracking receipt.');
  const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
  return new Blob([bytes],{type:match[1]});
}
