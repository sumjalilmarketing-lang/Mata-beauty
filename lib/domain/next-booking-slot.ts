import {localDateAt} from './time-zone';
export function nextBookingDate(rows:readonly {slot_start:string;collaborator_id?:string}[],timeZone:string,teamEnabled:boolean,collaboratorId?:string):string|null{
 const match=rows.find(row=>(!teamEnabled||!collaboratorId||row.collaborator_id===collaboratorId)&&Number.isFinite(Date.parse(row.slot_start)));
 return match?localDateAt(new Date(match.slot_start),timeZone):null;
}
