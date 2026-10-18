export function workspaceDay(timeZone='Asia/Qatar',value=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function shiftDay(day,amount){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10)}
export function daysBetween(from,to){return Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)}
export function appointmentConflicts(rows,record){
 if(!record.appointment_date||!record.appointment_time||!record.assigned_to||['Cancelled','Completed','Missed'].includes(record.status))return [];
 const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m};
 const start=minutes(record.appointment_time),end=start+Number(record.duration_minutes||30);
 return rows.filter(r=>r.id!==record.id&&r.appointment_date===record.appointment_date&&r.assigned_to?.trim().toLowerCase()===record.assigned_to.trim().toLowerCase()&&r.appointment_time&&!['Cancelled','Completed','Missed'].includes(r.status)&&start<minutes(r.appointment_time)+Number(r.duration_minutes||30)&&end>minutes(r.appointment_time));
}
