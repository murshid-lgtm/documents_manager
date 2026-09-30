import Link from 'next/link';

export default function NotFound(){
  return <main className="auth-shell"><section className="auth-card"><div className="auth-copy"><span className="auth-saas-kicker">404</span><h2>Page not found</h2><p className="muted">The requested page does not exist or is no longer available.</p></div><Link className="primary large" href="/">Return to workspace</Link></section></main>;
}
