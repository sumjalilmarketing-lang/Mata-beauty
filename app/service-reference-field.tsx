import {CUSTOM_SERVICE_NAME} from "@/lib/domain/service-reference";
export function ServiceReferenceField({catalog,defaultValue="",disabled=false}:{catalog:readonly {id:string;name:string}[];defaultValue?:string;disabled?:boolean}){
 const custom=catalog.find(item=>item.name===CUSTOM_SERVICE_NAME);
 const selectedValue=defaultValue || custom?.id || "";
 return <label>Catégorie de prestation<select name="serviceId" required defaultValue={selectedValue} disabled={disabled}><option value="" disabled>Choisir une catégorie</option>{custom && <option value={custom.id}>Saisie libre — mon intitulé ci-dessous</option>}{defaultValue && !catalog.some(item=>item.id===defaultValue) && <option value={defaultValue}>Référence actuelle</option>}{catalog.filter(item=>item.name!==CUSTOM_SERVICE_NAME).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>La catégorie sert au classement. Vous pouvez saisir le nom exact de votre prestation dans le champ ci-dessous.</small></label>;
}
