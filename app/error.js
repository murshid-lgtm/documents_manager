'use client';

import {useEffect} from 'react';

export default function ErrorBoundary({error,reset}){
  useEffect(()=>{console.error('Application route error',{digest:error?.digest})},[error]);
  const reloadNeeded=error?.name==='ChunkLoadError'||/Loading (?:CSS )?chunk .*failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error?.message||'');
  return <main className="auth-shell"><section className="auth-card"><div className="auth-copy"><h2>{reloadNeeded?'Workspace could not finish loading':'Something went wrong'}</h2><p className="muted">{reloadNeeded?'An update or interrupted connection may have prevented part of the workspace from loading. Check your connection and reload to try again.':'Please try again. If this continues, contact your workspace administrator.'}</p></div><button className="primary large" onClick={()=>reloadNeeded?window.location.reload():reset()}>{reloadNeeded?'Reload workspace':'Try again'}</button></section></main>;
}
