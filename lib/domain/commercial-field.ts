export const fieldActions = {shift_start:"Début de journée",shift_end:"Fin de journée",visit_start:"Arrivée en visite",visit_end:"Départ de visite"} as const;
export type FieldAction=keyof typeof fieldActions;
export type FieldEvent={id:string;team_id:string;actor_id:string;action:FieldAction;place:string;body:string;created_at:string;latitude:number|null;longitude:number|null;accuracy:number|null;geo_status:string;lead_id:string|null};
export type CommercialReport={id:string;team_id:string;actor_id:string;kind:string;title:string;body:string;created_at:string;acknowledged_at:string|null};
export type Appointment={id:string;team_id:string;actor_id:string;lead_id:string|null;title:string;place:string;starts_at:string;ends_at:string;status:string;notes:string;version:number};
export type GeoCapture={status:"available";latitude:number;longitude:number;accuracy:number;captured_at:string}|{status:"denied"|"unavailable"|"timeout"|"unsupported"};
export function captureCommercialPosition():Promise<GeoCapture>{
 if(typeof navigator==="undefined"||!navigator.geolocation)return Promise.resolve({status:"unsupported"});
 return new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({status:"available",latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString()}),e=>resolve({status:e.code===1?"denied":e.code===3?"timeout":"unavailable"}),{enableHighAccuracy:true,timeout:12000,maximumAge:0}));
}
export function localDateInput(value:string){const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function commercialMapUrl(latitude:number,longitude:number){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;}
