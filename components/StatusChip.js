export function statusTone(status=''){
 if(/cancel|fail|reject|void/i.test(status))return 'failed';
 if(/complete|deliver|^paid$|ready/i.test(status))return 'complete';
 if(/process|progress|active|partial/i.test(status))return 'progress';
 if(/pending|await|overdue/i.test(status))return 'pending';
 return 'new';
}
export function StatusIcon({status,size=18}){const tone=statusTone(status);return <svg className={`state-icon state-${tone}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeDasharray={['progress','complete','new'].includes(tone)?'5 2':undefined}/>{tone==='complete'?<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>:tone==='pending'?<path d="M12 6v6l4 3" strokeLinecap="round"/>:tone==='failed'?<path d="m8 8 8 8m0-8-8 8" strokeLinecap="round"/>:tone==='new'?<path d="M12 7v10M7 12h10"/>:null}</svg>}
export default function StatusChip({status,children}){return <span className={`state-chip state-${statusTone(status)}`}><StatusIcon status={status}/>{children||status}</span>}
