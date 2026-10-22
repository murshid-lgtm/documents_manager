'use client';
import {createContext,useContext,useEffect,useLayoutEffect,useState} from 'react';
import {supabase,isSupabaseConfigured} from '../lib/supabase';

const Branding=createContext({brand:null,ready:false});
const fields=['product_name','company_name','short_name','logo_url','favicon_url','app_icon_url','primary_color','secondary_color','accent_color','surface_color','login_title','login_subtitle','login_background_url','login_kicker','login_welcome_title','login_welcome_subtitle','login_button_text','login_logo_visible','login_logo_size','login_logo_alignment','login_logo_background','login_logo_radius','login_logo_container_width','login_logo_container_height','login_card_logo_visible','login_card_logo_size','login_card_logo_alignment','login_card_logo_background','login_card_logo_radius','login_card_logo_container_width','login_card_logo_container_height','footer_text'];
export function publicBrand(value){if(!value||typeof value!=='object')return null;return Object.fromEntries(fields.filter(key=>['string','number','boolean'].includes(typeof value[key])).map(key=>[key,typeof value[key]==='string'?value[key].slice(0,4096):value[key]]))}
export function useWorkspaceBranding(){return useContext(Branding)}
export default function WorkspaceBranding({children}){
 const [brand,setBrand]=useState(null),[ready,setReady]=useState(false);
 useLayoutEffect(()=>{try{const cached=JSON.parse(localStorage.getItem('workspace-public-branding-v1')||'null');if(cached?.host===location.host&&Date.now()-cached.at<86400000){setBrand(publicBrand(cached.brand));setReady(true)}}catch{}},[]);
 useEffect(()=>{
  let live=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
  if(!isSupabaseConfigured){setReady(true);clearTimeout(timer);return}
  (async()=>{try{
   const {data,error}=await supabase.rpc('public_branding',{request_host:location.host}).abortSignal(controller.signal);
   if(!live||error)return;
   const next=publicBrand(data);setBrand(next);
   try{if(next)localStorage.setItem('workspace-public-branding-v1',JSON.stringify({host:location.host,at:Date.now(),brand:next}));else localStorage.removeItem('workspace-public-branding-v1')}catch{}
  }catch{}finally{clearTimeout(timer);if(live)setReady(true)}})();
  return()=>{live=false;clearTimeout(timer);controller.abort()};
 },[]);
 useEffect(()=>{if(location.pathname==='/'&&(brand?.product_name||brand?.company_name))document.title=brand.product_name||brand.company_name},[brand]);
 return <Branding.Provider value={{brand,ready}}>{children}</Branding.Provider>;
}
