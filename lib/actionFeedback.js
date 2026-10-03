let pending=0,writePending=0,lastNotice=0,timer,failed=false;
const emit=(name,detail)=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(name,{detail}))};
export function notifyAction(message,tone){if(!message)return;lastNotice=Date.now();emit('workspace-feedback',{message:String(message),tone})}
export function beginAction(){pending++;emit('workspace-progress',{pending});let ended=false;return()=>{if(ended)return;ended=true;pending=Math.max(0,pending-1);emit('workspace-progress',{pending})}}
export async function actionFetch(input,options={}){
 const end=beginAction(),url=String(input?.url||input),method=String(options.method||input?.method||'GET').toUpperCase(),rpc=url.split('/rpc/')[1]?.split('?')[0];
 const mutation=!['GET','HEAD','OPTIONS'].includes(method)&&(/\/rest\/v1\//.test(url)||/\/storage\/v1\/object\//.test(url))&&(!rpc||/^(save_|create_|delete_|update_|set_|void_|record_|complete_|convert_|confirm_|checkout|receive_|pay_|add_)/.test(rpc));
 const started=Date.now();if(mutation){writePending++;clearTimeout(timer)}
 try{const response=await fetch(input,options);if(mutation){clearTimeout(timer);failed=failed||!response.ok;timer=setTimeout(()=>{if(writePending===0&&lastNotice<started)notifyAction(!failed?(method==='DELETE'?'Deleted.':method==='PATCH'?'Updated.':'Saved.'):'Action failed. Please try again.',!failed?'success':'error');failed=false},450)}return response}
 catch(error){if(mutation)notifyAction('Could not complete the action. Check your connection and retry.','error');throw error}
 finally{if(mutation)writePending--;end()}
}
