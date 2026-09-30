import Link from 'next/link';

export default function Forbidden(){
  return <main className="auth-shell"><section className="auth-card"><div className="auth-copy"><span className="auth-saas-kicker">403</span><h2>Access denied</h2><p className="muted">Your account does not have permission to open this page or resource.</p></div><Link className="primary large" href="/">Return to workspace</Link></section></main>;
}
