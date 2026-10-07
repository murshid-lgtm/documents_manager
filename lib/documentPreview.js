export function openDocumentPreview(title='PDF preview'){
 const id=crypto.randomUUID();
 const send=detail=>window.dispatchEvent(new CustomEvent('workspace-document-preview',{detail:{id,...detail}}));
 send({action:'open',title});
 return {configure:options=>send({action:'configure',...options}),loading:()=>send({action:'loading'}),setHtml:(html,paper='A4')=>send({action:'ready',html,paper}),fail:message=>send({action:'error',message}),close:()=>send({action:'close'})};
}
