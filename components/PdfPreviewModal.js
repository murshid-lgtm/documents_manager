'use client';
import AppIcon from './AppIcon';
import DialogPortal from './DialogPortal';
import {useCallback,useEffect,useRef,useState} from 'react';
import {preparePdf,documentFilename} from '../lib/preparePdf';
function Glyph({name}){return <AppIcon name={name==='email'?'mail':name==='full'?'scan':name} size={20}/>}
// Paint only pages near the scroll viewport. Printing uses the original PDF bytes.
function PdfPage({pdf,number,width,height,zoom,area,total}){
 const node=useRef(null),[visible,setVisible]=useState(number===1),[src,setSrc]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  if(!node.current)return;
  if(typeof IntersectionObserver==='undefined'){setVisible(true);return}
  const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{root:area,rootMargin:'700px 0px'});
  observer.observe(node.current);return()=>observer.disconnect();
 },[area]);
 useEffect(()=>{
  let stopped=false,task,page,canvas,url;setSrc(null);setError('');
  if(!visible)return;
  (async()=>{try{
   page=await pdf.getPage(number);if(stopped)return;
   const view=page.getViewport({scale:1.6});canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   task=page.render({canvasContext:canvas.getContext('2d'),viewport:view});await task.promise;if(stopped)return;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(stopped)return;if(!blob)throw Error('Preview image could not be created.');
   url=URL.createObjectURL(blob);setSrc(url);
  }catch(error){if(!stopped&&error.name!=='RenderingCancelledException')setError('This page could not be displayed. The PDF is still available to download or print.')}
  finally{if(canvas){canvas.width=0;canvas.height=0}page?.cleanup()}})();
  return()=>{stopped=true;task?.cancel();if(url)URL.revokeObjectURL(url)};
 },[pdf,number,visible]);
 return <figure ref={node} className="pdf-rendered-page" style={{width:width*zoom}}><div className="pdf-page-surface" style={{height:height*zoom}}>{src?<img src={src} width={width*zoom} height={height*zoom} alt={`Document page ${number} of ${total}`}/>:<div className="pdf-page-placeholder" role={visible?'status':undefined}>{error||`Page ${number}${visible?' · Loading preview…':''}`}</div>}</div><figcaption>Page {number} of {total}</figcaption></figure>
}
export default function PdfPreviewModal(){
 const [doc,setDoc]=useState(null),[full,setFull]=useState(false),[scale,setScale]=useState(1),[fit,setFit]=useState(true),[viewport,setViewport]=useState(900),[pages,setPages]=useState([]),[totalPages,setTotalPages]=useState(0),[ready,setReady]=useState(false),[printing,setPrinting]=useState(false),[pdfDocument,setPdfDocument]=useState(null),[printError,setPrintError]=useState('');
 const [stage,setStage]=useState('Preparing your document…');const [areaNode,setAreaNode]=useState(null),[emailOrg,setEmailOrg]=useState(null);
 useEffect(()=>{const listener=e=>setEmailOrg(e.detail?.organizationId||null);window.addEventListener('workspace-email-availability',listener);return()=>window.removeEventListener('workspace-email-availability',listener)},[]);
 const root=useRef(null),area=useRef(null),current=useRef(null),pdfUrl=useRef(null),printFrame=useRef(null),printTimer=useRef(null),pdfBytes=useRef(null);
 const bindArea=useCallback(node=>{area.current=node;setAreaNode(node)},[]);
 const close=()=>{current.current=null;clearTimeout(printTimer.current);printFrame.current?.remove();printFrame.current=null;setPrinting(false);setPrintError('');setDoc(null)};
 useEffect(()=>{const listener=e=>{const d=e.detail;if(d.action==='close-all')close();else if(d.action==='open'){current.current=d.id;setDoc({id:d.id,title:d.title});setReady(false);pdfBytes.current=null;setStage('Loading document layout…');setFull(false);setFit(true);setPrinting(false)}else if(d.id===current.current){if(d.action==='close')close();else if(d.action==='error')setDoc(x=>({...x,error:d.message}));else if(d.action==='configure')setDoc(x=>({...x,...(d.title?{title:d.title}:{}),...(d.kind?{kind:d.kind}:{}),...(d.orgId?{orgId:d.orgId,customerId:d.customerId,emailPurpose:d.emailPurpose}:{}),...(d.templates?{templates:d.templates,selectedTemplate:d.selectedTemplate,onSelectTemplate:d.onSelectTemplate}:{})}));else if(d.action==='loading'){setReady(false);pdfBytes.current=null;setDoc(x=>({...x,html:null,error:null}))}else if(d.action==='ready'){setReady(false);setDoc(x=>({...x,html:d.html,paper:d.paper,error:null}))}}};window.addEventListener('workspace-document-preview',listener);return()=>window.removeEventListener('workspace-document-preview',listener)},[]);
 useEffect(()=>{if(!doc||!area.current)return;const ro=new ResizeObserver(entries=>setViewport(entries[0].contentRect.width));ro.observe(area.current);return()=>ro.disconnect()},[Boolean(doc),full,areaNode]);
 useEffect(()=>{
  const abort=new AbortController();let task,live=true;setPages([]);setPdfDocument(null);setTotalPages(0);setReady(false);setPrinting(false);setPrintError('');pdfBytes.current=null;clearTimeout(printTimer.current);printFrame.current?.remove();printFrame.current=null;
  if(pdfUrl.current){URL.revokeObjectURL(pdfUrl.current);pdfUrl.current=null}
  if(doc?.html)(async()=>{try{
   const library=import('pdfjs-dist/legacy/build/pdf.mjs');library.catch(()=>{});
   const bytes=await preparePdf(doc.html,doc.paper,abort.signal,text=>{if(live)setStage(text)});if(!live)return;
   pdfBytes.current=bytes;pdfUrl.current=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setReady(true);setStage('PDF ready · Opening preview…');
   const pdfjs=await library;if(!live)return;pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';task=pdfjs.getDocument({data:bytes.slice()});const pdf=await task.promise;if(!live)return;
   const first=await pdf.getPage(1);if(!live)return;const view=first.getViewport({scale:96/72});first.cleanup();
   setTotalPages(pdf.numPages);setPages(Array.from({length:pdf.numPages},(_,i)=>({number:i+1,width:view.width,height:view.height})));setPdfDocument(pdf);
  }catch(error){if(live&&error.name!=='AbortError')setDoc(x=>({...x,error:error.message||'The document could not be prepared.'}))}})();
  return()=>{live=false;abort.abort();task?.destroy()?.catch(()=>{});if(pdfUrl.current){URL.revokeObjectURL(pdfUrl.current);pdfUrl.current=null}};
 },[doc?.id,doc?.html,doc?.paper]);
 useEffect(()=>()=>{clearTimeout(printTimer.current);printFrame.current?.remove()},[]);
 function emailPdf(){if(!pdfBytes.current)return;let raw='';for(const b of pdfBytes.current)raw+=String.fromCharCode(b);window.dispatchEvent(new CustomEvent('workspace-email-compose',{detail:{organizationId:doc.orgId,customerId:doc.customerId,purpose:doc.emailPurpose||doc.kind,reference:documentFilename(doc.title),attachment:{name:documentFilename(doc.title)+'.pdf',content:btoa(raw)}}}))}
 function download(){if(!pdfUrl.current)return;const link=document.createElement('a');link.href=pdfUrl.current;link.download=documentFilename(doc.title)+'.pdf';link.click()}
 function print(){
  if(printing||!pdfUrl.current)return;setPrinting(true);setPrintError('');printFrame.current?.remove();
  const frame=document.createElement('iframe');printFrame.current=frame;frame.title=documentFilename(doc.title);frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;bottom:0;border:0';
  const fail=()=>{if(printFrame.current!==frame)return;clearTimeout(printTimer.current);setPrinting(false);setPrintError('Your browser could not open printing. Download the PDF and print it from your PDF viewer.');frame.remove();printFrame.current=null};
  frame.onerror=fail;frame.onload=()=>{if(printFrame.current!==frame)return;clearTimeout(printTimer.current);try{frame.contentWindow.focus();frame.contentWindow.print();setPrinting(false)}catch{fail()}};
  frame.src=pdfUrl.current;document.body.append(frame);printTimer.current=setTimeout(fail,20000);
 }
 if(!doc)return null;const width=pages[0]?.width||794,zoom=fit?Math.max(.2,Math.min(1,(viewport-48)/width)):scale;
 return <DialogPortal><div className="pdf-preview-overlay"><section ref={root} className={`pdf-preview-modal pdf-kind-${doc.kind||'report'} ${full?'is-fullscreen':''}`} role="dialog" aria-modal="true" aria-label="PDF preview"><header><div><span className="pdf-kind-label">{({invoice:'Invoice',receipt:'Payment receipt',quotation:'Quotation',report:'Report',delivery:'Delivery note'})[doc.kind]||'Document'}</span><strong>{doc.title}</strong><small>{ready?`${totalPages?`${totalPages} ${totalPages===1?'page':'pages'}`:'PDF'} · PDF ready`:'Preparing PDF'}</small></div><nav>{doc.templates&&<label className="pdf-template-select"><span>{doc.kind==='report'?'Report layout':'Template'}</span><select aria-label="Print template" value={doc.selectedTemplate||'initial'} onChange={e=>{const value=e.target.value;setDoc(x=>({...x,selectedTemplate:value}));doc.onSelectTemplate?.(value)}}><option value="initial">Document layout</option><option value="">Default layout</option>{doc.templates.filter(t=>doc.showAllTemplates||!doc.kind||t.kind===doc.kind).map(t=><option key={t.id} value={t.id}>{t.name} · {t.kind}</option>)}</select><span className="pdf-all-layouts"><input type="checkbox" checked={Boolean(doc.showAllTemplates)} onChange={e=>setDoc(x=>({...x,showAllTemplates:e.target.checked}))}/> All types</span></label>}<button title="Zoom out" aria-label="Zoom out" disabled={!ready} onClick={()=>{setFit(false);setScale(Math.max(.25,zoom-.15))}}><Glyph name="minus"/></button><button title="Fit page" aria-label="Fit page" onClick={()=>setFit(true)}>{Math.round(zoom*100)}%</button><button title="Zoom in" aria-label="Zoom in" disabled={!ready} onClick={()=>{setFit(false);setScale(Math.min(2,zoom+.15))}}><Glyph name="plus"/></button><button title={full?'Exit full screen':'Full screen'} aria-label={full?'Exit full screen':'Full screen'} onClick={()=>setFull(x=>!x)}><Glyph name="full"/></button>{emailOrg&&emailOrg===doc.orgId&&<button title="Email PDF" aria-label="Email PDF" disabled={!ready} onClick={emailPdf}><Glyph name="email"/></button>}<button title="Download PDF" aria-label="Download PDF" disabled={!ready} onClick={download}><Glyph name="download"/></button><button title="Print" aria-label="Print" className="primary" disabled={!ready||printing} onClick={print}><Glyph name="print"/></button><button title="Close preview" aria-label="Close preview" onClick={close}><Glyph name="close"/></button></nav></header>{printError&&<p className="pdf-preview-notice" role="alert">{printError}</p>}<div ref={bindArea} className="pdf-preview-area">{doc.error?<div className="pdf-preview-error" role="alert"><strong>Preview could not be prepared</strong><p>{doc.error}</p><button onClick={close}>Close</button></div>:!pages.length?<div className="pdf-preview-loading" role="status"><span className="pdf-spinner"/><strong>Preparing your document</strong><small>{stage}</small><div className="pdf-loading-paper"><i/><i/><i/><i/></div></div>:pdfDocument&&pages.map(p=><PdfPage key={`${doc.id}:${p.number}`} pdf={pdfDocument} number={p.number} width={p.width} height={p.height} zoom={zoom} area={areaNode} total={totalPages}/>)}</div></section></div></DialogPortal>
}
