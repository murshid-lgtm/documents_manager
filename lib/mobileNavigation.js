export const MOBILE_GROUPS=[
 {name:'Workspace',items:[['automation','Alerts & automation','bell','automation'],['dashboard','Home','home','dashboard'],['work','Work queue','layers','operations'],['cases','Attestations','file','cases'],['documents','Documents & stages','layers','documents'],['import','Import data','file','import',true]]},
 {name:'Customers & sales',items:[['crm','Customers','people','crm'],['whatsapp','WhatsApp CRM','chat','crm'],['registry','Documents & reminders','file','crm'],['email','Email centre','mail','crm',true],['sales','Sales & invoices','wallet','sales'],['services','Service jobs','box','services']]},
 {name:'Operations',items:[['deliveries','Deliveries','box','deliveries'],['custody','Custody & handover','handover','custody'],['appointments','Appointments','calendar','appointments'],['batches','Batch reports','file','batches'],['courier','Courier shipments','truck','courier'],['operations','Operations','activity','operations']]},
 {name:'Finance & reports',items:[['collections','Collections','wallet','sales'],['accounting','Accounts','bank','sales'],['payments','Payments','wallet','payments'],['reports','Reports','chart','reports']]}
];
export function mobileGroups(enabled,query='',isAdmin=false){
 const search=query.trim().toLowerCase();
 const order=['dashboard','automation','crm','sales','cases','services','documents','registry','appointments','work','operations','batches','custody','courier','deliveries','whatsapp','email','payments','collections','accounting','reports','import'];
 const items=MOBILE_GROUPS.flatMap(group=>group.items).filter(([,label,,module,adminOnly])=>(!adminOnly||isAdmin)&&enabled(module)&&(!search||label.toLowerCase().includes(search))).sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
 return items.length?[{name:'',items}]:[];
}
export function mobileCreateActions(enabled){return [
 ['attestation','Attestation','Invoice & document workflow','file',enabled('cases')&&enabled('sales')],
 ['invoice','Invoice','Services & job orders','file',enabled('sales')],
 ['sale','Quick sale','Counter bill & payment','wallet',enabled('sales')],
 ['quote','Quotation','Prepare an estimate','file',enabled('sales')],
 ['payment','Receive payment','Collect against an invoice','wallet',enabled('sales')],
 ['delivery','Delivery','Hand over to a customer','box',enabled('deliveries')],
 ['appointment','Appointment','Schedule work','calendar',enabled('appointments')]
 ].filter(action=>action[4]);}
export function mobileTabs(enabled){
 const work=enabled('operations')?['work','My work','layers']:enabled('cases')?['cases','Attestations','file']:enabled('services')?['services','Jobs','box']:null;
 return [enabled('dashboard')?['dashboard','Home','home']:null,work,enabled('cases')?['scan','Scan','scan']:null,enabled('crm')?['crm','Customers','people']:enabled('sales')?['sales','Sales','wallet']:null,['more','More','grid']].filter(Boolean);
}
