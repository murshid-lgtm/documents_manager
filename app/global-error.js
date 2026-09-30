'use client';

import {useEffect} from 'react';

export default function GlobalError({error,reset}){
  useEffect(()=>{console.error('Application error',{digest:error?.digest})},[error]);
  return <html lang="en"><body><main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'system-ui',background:'#f4f7fc'}}><section style={{maxWidth:520,padding:32,borderRadius:24,background:'#fff',boxShadow:'0 20px 60px rgba(20,33,61,.14)'}}><h1 style={{margin:'0 0 12px'}}>Workspace unavailable</h1><p style={{color:'#64748b',lineHeight:1.6}}>The workspace could not load. Please retry; if it continues, contact your system administrator.</p><button onClick={()=>reset()} style={{border:0,borderRadius:12,padding:'12px 18px',background:'#3265df',color:'#fff',fontWeight:700,cursor:'pointer'}}>Reload workspace</button></section></main></body></html>;
}
