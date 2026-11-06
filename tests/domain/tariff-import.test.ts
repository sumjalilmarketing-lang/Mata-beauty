import {expect,it} from 'vitest';
import {parseTariffText} from '../../lib/domain/tariff-import';
it('extracts French tariff rows and explicit durations without inventing missing ones',()=>{
 const rows=parseTariffText('NOTRE CARTE\nCoupe homme 30 min 5 000 FCFA\nTresses africaines : 12.000 F\nSoin visage 45 minutes 7 500 XOF');
 expect(rows.map(({title,price,duration})=>({title,price,duration}))).toEqual([
  {title:'Coupe homme',price:'5000',duration:'30'},
  {title:'Tresses africaines',price:'12000',duration:''},
  {title:'Soin visage',price:'7500',duration:'45'},
 ]);
});
it('preserves decimal and zero prices for manual review rather than rounding',()=>{
 expect(parseTariffText('Soin 25,50 €\nDiagnostic 0 FCFA').map(row=>row.price)).toEqual(['25.50','0']);
});
it('accepts freely named services and ignores isolated numbers and headings',()=>{
 expect(parseTariffText('2026\nTARIFS\nRituel inconnu 90 min 15 000 CFA')).toEqual([
  {title:'Rituel inconnu',price:'15000',duration:'90',description:'',selected:true},
 ]);
});
it('bounds imported content to a reviewable batch',()=>{
 expect(parseTariffText(Array.from({length:80},(_,i)=>`Prestation ${i} : 1000 FCFA`).join('\n'))).toHaveLength(40);
 expect(parseTariffText('x'.repeat(20001)+' 5000')).toEqual([]);
});
