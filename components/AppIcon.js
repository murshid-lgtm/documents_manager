'use client';
import {
 ArrowRight,ArrowUpRight,ArrowLeftRight,Activity,Archive,ArchiveRestore,AlertTriangle,
 Bell,Bookmark,BriefcaseBusiness,CalendarDays,ChartNoAxesColumn,Check,ChevronDown,
 ChevronLeft,ChevronRight,ChevronUp,Clock,Copy,CreditCard,Download,Ellipsis,Eye,
 FileText,Globe,GripVertical,History,House,Info,Landmark,Layers,LayoutGrid,Link,
 List,LogOut,Maximize,MessageCircle,Minus,Moon,NotebookPen,Package,Paperclip,
 Pencil,Phone,Plus,Printer,RefreshCw,ScanLine,Search,Send,Settings2,
 SlidersHorizontal,Star,Sun,Trash2,Truck,Upload,UserRound,UserRoundPlus,UsersRound,
 Wallet,Car,X,Zap,Settings,Mail,Share2,LayoutDashboard,Workflow,ContactRound,
 ShoppingBag,BadgeCheck,GitBranch,FileClock,ListTodo,Gauge,Files,Handshake,
 PackageCheck,BanknoteArrowDown,HandCoins,ChartNoAxesCombined,FileInput,
 FilePenLine,ShoppingCart,CalendarPlus,Tag,Building2,ReceiptText,ClipboardList,
 FilePlus2,LayoutTemplate,Route,IdCardLanyard,File,Image,ChartPie,FileDown,
 Sheet,FileSpreadsheet,FileType,PlugZap,Ban,MapPin
} from 'lucide-react';

// Named imports keep the production bundle limited to icons used by this app.
const icons={
 copy:Copy,mail:Mail,minus:Minus,fast:Zap,chat:MessageCircle,home:House,file:File,
 'user-add':UserRoundPlus,user:UserRound,people:UsersRound,settings:Settings,note:NotebookPen,
 send:Send,refresh:RefreshCw,attach:Paperclip,link:Link,receipt:ReceiptText,briefcase:BriefcaseBusiness,
 wallet:Wallet,bell:Bell,bank:Landmark,car:Car,moon:Moon,sun:Sun,'arrow-right':ArrowRight,
 external:ArrowUpRight,more:Ellipsis,history:History,calendar:CalendarDays,eye:Eye,expand:Maximize,
 grid:LayoutGrid,list:List,phone:Phone,'chevron-down':ChevronDown,'chevron-up':ChevronUp,
 'chevron-left':ChevronLeft,'chevron-right':ChevronRight,trash:Trash2,plus:Plus,close:X,
 search:Search,scan:ScanLine,activity:Activity,package:Package,handover:Handshake,transfer:ArrowLeftRight,
 print:Printer,edit:Pencil,grip:GripVertical,layers:Layers,batch:Files,truck:Truck,
 chart:ChartNoAxesColumn,globe:Globe,upload:Upload,logout:LogOut,check:Check,alert:AlertTriangle,
 info:Info,download:Download,archive:Archive,restore:ArchiveRestore,filter:SlidersHorizontal,
 clock:Clock,bookmark:Bookmark,star:Star,share:Share2,card:CreditCard,sliders:Settings2,
 dashboard:LayoutDashboard,automation:Workflow,crm:ContactRound,sales:ShoppingBag,
 attestation:BadgeCheck,'service-job':BriefcaseBusiness,'document-stages':GitBranch,
 'document-reminders':FileClock,'work-queue':ListTodo,operations:Gauge,custody:Handshake,
 delivery:PackageCheck,payment:BanknoteArrowDown,collections:HandCoins,accounts:Landmark,
 report:ChartNoAxesCombined,import:FileInput,invoice:FileText,quote:FilePenLine,
 'quick-sale':ShoppingCart,'new-appointment':CalendarPlus,label:Tag,company:Building2,
 'job-order':ClipboardList,'add-document':FilePlus2,template:LayoutTemplate,
 tracking:Route,staff:IdCardLanyard,image:Image,financials:ChartPie,
 pdf:FileDown,excel:Sheet,csv:FileSpreadsheet,word:FileType,connection:PlugZap,cancel:Ban,map:MapPin
};
const aliases={box:'package',document:'file',vehicle:'car',job:'service-job',handover:'custody',
 sale:'sales',back:'chevron-left',arrow:'arrow-right'};

export default function AppIcon({name,size=20,className=''}){
 const key=aliases[name]||name;
 const common={width:size,height:size,fill:'none',stroke:'currentColor',strokeWidth:1.5,
  focusable:'false','aria-hidden':'true','data-icon':key,className:'app-icon '+className};
 // Brand marks are kept distinct from the interface icon vocabulary.
 if(key==='whatsapp')return <svg {...common} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="m4 17-1 4 4-1a9 9 0 1 0-3-3Z"/><path d="m8 7 2 3-1 1c1 2 2 3 4 4l1-1 3 2c-1 3-4 2-7-1s-4-6-2-8Z"/></svg>;
 const Icon=icons[key];
 return Icon?<Icon {...common}/>:null;
}
