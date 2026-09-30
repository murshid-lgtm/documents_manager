'use client';

import {useEffect} from 'react';

export default function ErrorBoundary({error,reset}){
  useEffect(()=>{console.error('Application route error',{digest:error?.digest})},[error]);
  return <main className="auth-shell"><section className="auth-card"><div className="auth-copy"><h2>Something went wrong</h2><p className="muted">Please try again. If this continues, contact your workspace administrator.</p></div><button className="primary large" onClick={()=>reset()}>Try again</button></section></main>;
}
