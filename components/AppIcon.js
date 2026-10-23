'use client';
export default function AppIcon({name,size=20,className=''}){
  name=({box:'package',document:'file',staff:'people',vehicle:'car',bank:'bank',job:'briefcase',sale:'receipt',note:'note',back:'chevron-left',arrow:'arrow-right',moon:'moon',sun:'sun',people:'people',refresh:'refresh',link:'link',more:'more'}[name]||name);
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,focusable:'false',strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true',className:'app-icon '+className};

  const shapes={
   copy:<><rect x="8" y="8" width="13" height="13" rx="3" fill="currentColor" fillOpacity=".07"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/></>,
   mail:<><rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fillOpacity=".07"/><path d="m3 7 9 6 9-6"/></>,
   minus:<path d="M5 12h14"/>,
   fast:<path d="m13 3-9 11h7l-1 7L20 9h-7Z" fill="currentColor" fillOpacity=".12"/>,
   chat:<><path d="M8 20 3 21l1.4-4.5A9 9 0 1 1 8 20Z" fill="currentColor" fillOpacity=".08"/><path d="M8 10h8M8 14h5"/></>,
   whatsapp:<><path d="m4 17-1 4 4-1a9 9 0 1 0-3-3Z" fill="currentColor" fillOpacity=".08"/><path d="m8 7 2 3-1 1c1 2 2 3 4 4l1-1 3 2c-1 3-4 2-7-1s-4-6-2-8Z" strokeWidth="1.4"/></>,
   home:<><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="currentColor" fillOpacity=".08"/><path d="M9 21v-7h6v7"/></>,
   file:<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" fill="currentColor" fillOpacity=".07"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>,
   'user-add':<><circle cx="9" cy="8" r="3.5" fill="currentColor" fillOpacity=".1"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M19 6v8M15 10h8"/></>,
   user:<><circle cx="12" cy="8" r="4" fill="currentColor" fillOpacity=".1"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
   people:<><circle cx="9" cy="8" r="3.5" fill="currentColor" fillOpacity=".1"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M16 5a3.5 3.5 0 0 1 0 7M21.5 21v-2a6 6 0 0 0-4-5.5"/></>,
   settings:<><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z" fill="currentColor" fillOpacity=".07"/><circle cx="12" cy="12" r="3"/></>,
   note:<><rect x="4" y="3" width="16" height="18" rx="3" fill="currentColor" fillOpacity=".07"/><path d="M8 8h8M8 12h8M8 16h4"/></>,
   send:<><path d="m3 4 18 8-18 8 4-8Z" fill="currentColor" fillOpacity=".1"/><path d="M7 12h14"/></>,
   refresh:<><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></>,
   attach:<path d="m9 17 7-7a3 3 0 0 0-4-4l-8 8a5 5 0 0 0 7 7L21 11M7 15l8-8"/>,
   link:<path d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 1) scale(.83)"/>,
   receipt:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2Z" fill="currentColor" fillOpacity=".07"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
   briefcase:<><rect x="3" y="7" width="18" height="14" rx="3" fill="currentColor" fillOpacity=".08"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a19 19 0 0 0 18 0M12 12v3"/></>,
   wallet:<><rect x="3" y="6" width="18" height="15" rx="3" fill="currentColor" fillOpacity=".08"/><path d="M3 9V5a2 2 0 0 1 2-2h12M21 11h-5a2 2 0 0 0 0 4h5"/><path d="M16 13h.01"/></>,
   bell:<><path d="M5 9a7 7 0 0 1 14 0c0 5 2 7 2 8H3c0-1 2-3 2-8Z" fill="currentColor" fillOpacity=".08"/><path d="M9 21h6"/></>,
   bank:<><path d="m3 8 9-5 9 5Z" fill="currentColor" fillOpacity=".1"/><path d="M5 12v6M10 12v6M14 12v6M19 12v6M3 21h18"/></>,
   car:<><path d="M4 10 6 4h12l2 6M3 10h18v9H3ZM5 19v2M19 19v2M6 14h2M16 14h2"/></>,
   moon:<path d="M20 15.5A8.8 8.8 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" fill="currentColor" fillOpacity=".08"/>,
   sun:<><circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity=".12"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/></>,
   'arrow-right':<path d="M4 12h16m-6-6 6 6-6 6"/>,
   external:<><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
   more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>
  };
  if(shapes[name])return <svg {...common}>{shapes[name]}</svg>;
  if(name==='chat')return <svg {...common}><path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z"/><path d="M7 10h9M7 14h5"/></svg>;
  if(name==='history')return <svg {...common}><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l3 2"/></svg>;
  if(name==='calendar')return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h3M8 17h5"/></svg>;
  if(name==='eye')return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>;
  if(name==='expand')return <svg {...common}><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg>;
  if(name==='grid')return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if(name==='list')return <svg {...common}><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>;
  if(name==='phone')return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92Z"/></svg>;
  if(name==='user')return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
  if(name==='chevron-down')return <svg {...common}><path d="m7 9.5 5 5 5-5"/></svg>;
  if(name==='chevron-up')return <svg {...common}><path d="m7 14.5 5-5 5 5"/></svg>;
  if(name==='chevron-left')return <svg {...common}><path d="m15 18-6-6 6-6"/></svg>;
  if(name==='chevron-right')return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
  if(name==='file')return <svg {...common}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>;
  if(name==='trash')return <svg {...common}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>;
  if(name==='plus')return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if(name==='close')return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  if(name==='search')return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
  if(name==='home')return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></svg>;
  if(name==='scan')return <svg {...common}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M7 12h10"/></svg>;
  if(name==='activity')return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>;
  if(name==='package')return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>;
  if(name==='handover')return <svg {...common}><path d="M4 8h10M11 5l3 3-3 3M20 16H10M13 13l-3 3 3 3"/></svg>;
  if(name==='wallet')return <svg {...common}><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h13"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/></svg>;
  if(name==='print')return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>;
  if(name==='edit')return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>;
  if(name==='grip')return <svg {...common}><circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/></svg>;
  if(name==='layers')return <svg {...common}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
  if(name==='batch')return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
  if(name==='truck')return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if(name==='chart')return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if(name==='globe')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
  if(name==='upload')return <svg {...common}><path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 14v6h16v-6"/></svg>;
  if(name==='logout')return <svg {...common}><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></svg>;
  if(name==='check')return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if(name==='alert')return <svg {...common}><path d="M12 3 2.8 20h18.4zM12 9v4M12 17h.01"/></svg>;
  if(name==='info')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>;
  if(name==='download')return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>;
  if(name==='archive')return <svg {...common}><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M2 5l2-3h16l2 3M9 10h6"/></svg>;
  if(name==='restore')return <svg {...common}><path d="M4 7v5h5M5.5 12a7 7 0 1 0 2-5M4 7l3-3"/></svg>;
  if(name==='bell')return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  if(name==='filter')return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
  if(name==='clock')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if(name==='settings')return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
  if(name==='bookmark')return <svg {...common}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/></svg>;
  if(name==='star')return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>;
  if(name==='share')return <svg {...common}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>;
  return null;
}
