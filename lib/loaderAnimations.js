export const LOADER_ANIMATIONS=[
 {id:'signature',name:'Signature',description:'A quiet logo entrance with a fine travelling line.'},
 {id:'contour',name:'Contour',description:'A single hairline arc around your identity.'},
 {id:'horizon',name:'Horizon',description:'Two lines meet beneath the brand.'},
 {id:'aperture',name:'Aperture',description:'Soft concentric outlines open around the logo.'},
 {id:'outline',name:'Outline',description:'Four precise corners draw a frame.'},
 {id:'silk',name:'Silk',description:'A soft ribbon of light passes behind the brand.'},
 {id:'echo',name:'Echo',description:'Delicate circular waves fade outwards.'},
 {id:'duet',name:'Duet',description:'Two small points move in a balanced orbit.'},
 {id:'rhythm',name:'Rhythm',description:'Five slim bars move in a measured cadence.'},
 {id:'mosaic',name:'Mosaic',description:'Four small tiles assemble and separate.'},
 {id:'spotlight',name:'Spotlight',description:'A slow pool of light breathes behind the logo.'},
 {id:'still',name:'Still',description:'A clean brand presentation with subtle loading dots.'}
];
export const loaderAnimation=value=>LOADER_ANIMATIONS.some(item=>item.id===value)?value:'signature';
export function loaderLayout(brand={}){
 const number=(key,fallback,min,max)=>{const n=Number(brand?.[key]);return Number.isFinite(n)&&brand?.[key]!=null?Math.min(max,Math.max(min,Math.round(n))):fallback};
 return {loader_logo_size:number('loader_logo_size',100,50,150),loader_name_size:number('loader_name_size',24,16,36),loader_name_gap:number('loader_name_gap',8,0,40),loader_name_position:['below','above','right','hidden'].includes(brand?.loader_name_position)?brand.loader_name_position:'below',loader_name_alignment:['left','center','right'].includes(brand?.loader_name_alignment)?brand.loader_name_alignment:'center'};
}
