export const CUSTOM_SERVICE_NAME="Prestation personnalisée";
export function serviceReference(selected:unknown,catalog:readonly {id:string;name:string}[]):string {
 const id=typeof selected==="string"?selected.trim():"";
 return id || catalog.find(item=>item.name===CUSTOM_SERVICE_NAME)?.id || "";
}
