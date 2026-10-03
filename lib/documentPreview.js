export function openDocumentPreview(title='PDF preview'){
 const id=crypto.randomUUID();
 const send=detail=>window.dispatchEvent(new CustomEvent('workspace-document-preview',{detail:{id,...detail}}));
 send({action:'open',title});
 return {setHtml:(html,paper='A4')=>send({action:'ready',html,paper}),fail:message=>send({action:'error',message}),close:()=>send({action:'close'})};
}
