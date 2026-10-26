export function workspaceDay(timeZone='Asia/Qatar',value=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function shiftDay(day,amount){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10)}
export function daysBetween(from,to){return Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)}
// Compare local calendar intervals, including appointments that cross midnight.
// These values describe the company's wall clock, not the browser's timezone.
function appointmentInterval(record){
 const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(record.appointment_time||'');
 if(!match||Number(match[1])>23||Number(match[2])>59||!/^\d{4}-\d{2}-\d{2}$/.test(record.appointment_date||''))return null;
 const day=Date.parse(`${record.appointment_date}T00:00:00Z`);
 const duration=Number(record.duration_minutes??30);
 if(!Number.isFinite(day)||!Number.isFinite(duration)||duration<=0)return null;
 const start=day/60000+Number(match[1])*60+Number(match[2]);
 return {start,end:start+duration};
}
export function assigneeAliases(people){
 const aliases=Object.create(null),names=new Map();
 for(const person of people){
  aliases[String(person.id).toLowerCase()]=String(person.id).toLowerCase();
  const name=person.full_name?.trim().toLowerCase();
  if(name)names.set(name,[...(names.get(name)||[]),String(person.id).toLowerCase()]);
 }
 for(const [name,ids] of names)if(ids.length===1)aliases[name]=ids[0];
 return aliases;
}
export function appointmentConflicts(rows,record,aliases={}){
 const inactive=row=>['Cancelled','Completed','Missed'].includes(row.status);
 const owner=row=>{const value=String(row.assigned_profile_id||row.assigned_to||'').trim().toLowerCase();return Object.hasOwn(aliases,value)?aliases[value]:value};
 const interval=appointmentInterval(record),assigned=owner(record);
 if(!interval||!assigned||inactive(record))return [];
 return rows.filter(row=>{
  if((record.id!=null&&row.id===record.id)||inactive(row)||owner(row)!==assigned)return false;
  const other=appointmentInterval(row);
  return other&&interval.start<other.end&&interval.end>other.start;
 });
}
export function appointmentTimeRange(record){
 const interval=appointmentInterval(record);
 if(!interval)return 'Any time';
 const format=minutes=>`${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
 const days=Math.floor(interval.end/1440)-Math.floor(interval.start/1440);
 return `${format(interval.start)}–${format(interval.end)}${days?` (+${days} ${days===1?'day':'days'})`:''}`;
}
