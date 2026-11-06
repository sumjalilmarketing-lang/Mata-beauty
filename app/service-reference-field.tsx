import {CUSTOM_SERVICE_NAME} from "@/lib/domain/service-reference";
export function ServiceReferenceField({catalog,defaultValue="",disabled=false}:{catalog:readonly {id:string;name:string}[];defaultValue?:string;disabled?:boolean}){
 const custom=catalog.find(item=>item.name===CUSTOM_SERVICE_NAME);
 return <label>Suggestion de prestation (facultatif)<select name="serviceId" defaultValue={defaultValue===custom?.id?"":defaultValue} disabled={disabled}><option value="">Saisie libre — ma propre prestation</option>{defaultValue && !catalog.some(item=>item.id===defaultValue) && <option value={defaultValue}>Référence actuelle</option>}{catalog.filter(item=>item.name!==CUSTOM_SERVICE_NAME).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Vous pouvez ignorer ces suggestions. Saisissez le nom de votre prestation dans le champ ci-dessous.</small></label>;
}
