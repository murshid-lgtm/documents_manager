export const MOBILE_GROUPS=[
 {name:'Workspace',items:[['automation','Alerts & automation','automation','automation'],['dashboard','Home','dashboard','dashboard'],['work','Work queue','work-queue','operations'],['cases','Attestations','attestation','cases'],['documents','Documents & stages','document-stages','documents'],['import','Import data','import','import',true]]},
 {name:'Customers & sales',items:[['crm','Customers','crm','crm'],['whatsapp','WhatsApp CRM','whatsapp','crm'],['registry','Documents & reminders','document-reminders','crm'],['email','Email centre','mail','crm',true],['sales','Sales & invoices','sales','sales'],['services','Service jobs','service-job','services']]},
 {name:'Operations',items:[['deliveries','Deliveries','delivery','deliveries'],['custody','Custody & handover','custody','custody'],['appointments','Appointments','calendar','appointments'],['batches','Batch reports','batch','batches'],['courier','Courier shipments','truck','courier'],['operations','Operations','operations','operations']]},
 {name:'Finance & reports',items:[['collections','Collections','collections','sales'],['accounting','Accounts','accounts','sales'],['payments','Payments','payment','payments'],['reports','Reports','report','reports']]}
];
export function mobileGroups(enabled,query='',isAdmin=false){
 const search=query.trim().toLowerCase();
 const order=['dashboard','automation','crm','sales','cases','services','documents','registry','appointments','work','operations','batches','custody','courier','deliveries','whatsapp','email','payments','collections','accounting','reports','import'];
 const items=MOBILE_GROUPS.flatMap(group=>group.items).filter(([,label,,module,adminOnly])=>(!adminOnly||isAdmin)&&enabled(module)&&(!search||label.toLowerCase().includes(search))).sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
 return items.length?[{name:'',items}]:[];
}
export function mobileCreateActions(enabled){return [
 ['attestation','Attestation','Invoice & document workflow','attestation',enabled('cases')&&enabled('sales')],
 ['invoice','Invoice','Services & job orders','invoice',enabled('sales')],
 ['sale','Quick sale','Counter bill & payment','quick-sale',enabled('sales')],
 ['quote','Quotation','Prepare an estimate','quote',enabled('sales')],
 ['payment','Receive payment','Collect against an invoice','payment',enabled('sales')],
 ['delivery','Delivery','Hand over to a customer','delivery',enabled('deliveries')],
 ['appointment','Appointment','Schedule work','new-appointment',enabled('appointments')]
 ].filter(action=>action[4]);}
export function mobileTabs(enabled){
 const work=enabled('operations')?['work','My work','work-queue']:enabled('cases')?['cases','Attestations','attestation']:enabled('services')?['services','Jobs','service-job']:null;
 return [enabled('dashboard')?['dashboard','Home','dashboard']:null,work,enabled('cases')?['scan','Scan','scan']:null,enabled('crm')?['crm','Customers','crm']:enabled('sales')?['sales','Sales','sales']:null,['more','More','more']].filter(Boolean);
}
