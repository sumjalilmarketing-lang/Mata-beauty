export type TariffDraft={title:string;price:string;duration:string;description:string;selected:boolean};
export function parseTariffText(text:string):TariffDraft[]{
 return text.slice(0,20000).split(/\r?\n/).flatMap(line=>{
  const duration=line.match(/\b(\d{1,3})\s*(?:min(?:utes?)?|mn)\b/i);
  const clean=line.replace(/\b\d{1,3}\s*(?:min(?:utes?)?|mn)\b/gi,' ').trim();
  const price=clean.match(/(\d+(?:[ .\u00a0]\d{3})*(?:[,.]\d{1,2})?)\s*(?:FCFA|F\s*CFA|XOF|CFA|EUR|€|F)?\s*$/i);
  if(!price||price.index===undefined)return [];
  const title=clean.slice(0,price.index).replace(/[.\s:;|—–-]+$/g,'').trim();
  if(title.length<2)return [];
  const amount=price[1].replace(/[\s\u00a0]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  return [{title:title.slice(0,120),price:amount,duration:duration?.[1]??'',description:'',selected:true}];
 }).slice(0,40);
}
