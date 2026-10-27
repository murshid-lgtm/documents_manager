import {workspaceDay,daysBetween} from './workspaceDates.js';
export const localDay=(timeZone='Asia/Qatar',value=new Date())=>workspaceDay(timeZone,value);
export function expiryState(value,today=localDay()){
 if(!value)return {label:'No expiry',tone:'neutral'};
 const days=daysBetween(today,value);
 if(!Number.isFinite(days))return {label:'Invalid expiry date',tone:'neutral'};
 return days<0?{label:`Expired · ${Math.abs(days)}d`,tone:'danger'}:days===0?{label:'Expires today',tone:'warning'}:days<=30?{label:`Due in ${days}d`,tone:'warning'}:{label:`${days} days left`,tone:'good'};
}
