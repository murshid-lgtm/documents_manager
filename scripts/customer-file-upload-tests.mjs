import assert from 'node:assert/strict';
import fs from 'node:fs';
const {uploadCustomerFile}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('lib/customerFileUpload.js','utf8')).toString('base64'));
const file=new File(['private test attachment'],'TEST.pdf',{type:'application/pdf'});
const row={id:'stable-id',organization_id:'org',customer_id:'customer',record_id:'record',name:file.name,object_path:'org/customer/record/stable-id',size_bytes:file.size,content_type:file.type};
function fixture({metadataLost=false,uploadLost=false,throwUpload=false,throwInsert=false,lookupError=false,downloadError=false,different=false,wrongScope=false,missing=false,metadataPresent=false}={}){
 let metadata=metadataPresent?{...row}:null,stored=null,firstInsert=true,firstUpload=true;const calls=[];
 const client={
  from(table){
   assert.equal(table,'customer_record_files');const filters={};
   const q={
    select(){return q},eq(k,v){filters[k]=v;return q},
    async maybeSingle(){calls.push(['lookup',{...filters}]);return lookupError?{error:Error('Read denied')}:{data:missing?null:wrongScope?{...metadata,record_id:'other'}:metadata}},
    async insert(value){
     calls.push(['insert',{...value}]);if(metadata)return {error:Error('Duplicate ID')};metadata={...value};
     if(firstInsert){firstInsert=false;if(throwInsert)throw Error('Insert response lost');if(metadataLost)return {error:Error('Insert response lost')}}
     return {error:null};
    }
   };return q;
  },
  storage:{from(bucket){
   assert.equal(bucket,'customer-records');return {
    async upload(path,body,options){
     calls.push(['upload',path,options]);assert.equal(body,file);if(stored)return {error:Error('Already exists')};stored=different?new Blob(['x'.repeat(file.size)]):body;
     if(firstUpload){firstUpload=false;if(throwUpload)throw Error('Upload response lost');if(uploadLost)return {error:Error('Upload response lost')}}
     return {error:null};
    },
    async download(path){calls.push(['download',path]);return downloadError?{error:Error('Offline')}:{data:stored}}
   };
  }}
 };
 return {client,calls};
}
for(const options of [{metadataPresent:true},{},{metadataLost:true},{throwInsert:true},{uploadLost:true},{throwUpload:true},{metadataLost:true,uploadLost:true}]){
 const f=fixture(options);await uploadCustomerFile(f.client,{file,row});
 for(const c of f.calls.filter(c=>c[0]==='lookup'))assert.deepEqual(c[1],{organization_id:'org',customer_id:'customer',record_id:'record',id:'stable-id'});
 for(const c of f.calls.filter(c=>c[0]==='upload')){assert.equal(c[1],row.object_path);assert.equal(c[2].upsert,false)}
 if(options.uploadLost||options.throwUpload)assert(f.calls.some(c=>c[0]==='download'));
}
for(const options of [{metadataLost:true,lookupError:true},{metadataLost:true,missing:true},{metadataLost:true,wrongScope:true},{uploadLost:true,different:true}]){
 const f=fixture(options);await assert.rejects(()=>uploadCustomerFile(f.client,{file,row}));
 if(options.metadataLost)assert(!f.calls.some(c=>c[0]==='upload'));
}
const retry=fixture({uploadLost:true,downloadError:true});await assert.rejects(()=>uploadCustomerFile(retry.client,{file,row}));
// Once connectivity returns, retry reconciles the existing immutable object.
const realFrom=retry.client.storage.from;retry.client.storage.from=bucket=>{const storage=realFrom(bucket);storage.download=async()=>({data:file});return storage};
await uploadCustomerFile(retry.client,{file,row});
assert.deepEqual(retry.calls.filter(c=>c[0]==='insert').map(c=>c[1].id),['stable-id','stable-id']);
assert.deepEqual(retry.calls.filter(c=>c[0]==='upload').map(c=>c[1]),[row.object_path,row.object_path]);
console.log('PASS: private upload success, lost insert/upload responses, scoped reconciliation, exact content checks, access failures and stable-ID retries. Mocked storage/database only.');
