const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const swc=require('next/dist/build/swc');await swc.loadBindings();
 const code=swc.transformSync(fs.readFileSync('app/error.js','utf8'),{filename:'app/error.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}}).code;
 let reloads=0,resets=0;const module={exports:{}};
 const jsx=(type,props)=>({type,props});
 new Function('require','module','exports','window',code)(name=>name==='react'?{useEffect:()=>{}}:{jsx,jsxs:jsx},module,module.exports,{location:{reload:()=>reloads++}});
 function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;return [].concat(tree.props?.children||[]).map(child=>find(child,type)).find(Boolean)}
 for(const error of [{name:'ChunkLoadError',message:'Loading chunk 214 failed.'},{message:'Loading CSS chunk 12 failed.'},{message:'Failed to fetch dynamically imported module'},{message:'Importing a module script failed.'}]){
  const tree=module.exports.default({error,reset:()=>resets++}),button=find(tree,'button');
  assert.equal(button.props.children,'Reload workspace');button.props.onClick();
 }
 assert.equal(reloads,4);assert.equal(resets,0);
 const tree=module.exports.default({error:Error('Sensitive internal failure'),reset:()=>resets++});
 assert.equal(find(tree,'button').props.children,'Try again');find(tree,'button').props.onClick();assert.equal(resets,1);assert.equal(reloads,4);
 assert(!JSON.stringify(tree).includes('Sensitive internal failure'));
 console.log('PASS: failed app chunks offer explicit reload; ordinary errors retain retry without exposing internal details.');
})().catch(e=>{console.error(e);process.exitCode=1});
