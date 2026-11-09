begin;

-- The same accent-insensitive aliases used by the public discovery UI.
-- This pure helper runs as the caller and reads no tables.
create function public.inspiration_search_normalized(target_text text)
returns text language sql immutable parallel safe security invoker set search_path='' as $$
  select coalesce(string_agg(case token
    when 'barber' then 'barbier' when 'barbers' then 'barbier' when 'barbiers' then 'barbier'
    when 'coiffeur' then 'coiffure' when 'coiffeurs' then 'coiffure' when 'coiffeuse' then 'coiffure' when 'coiffeuses' then 'coiffure'
    when 'onglerie' then 'ongles' when 'tresse' then 'tresses' when 'hommes' then 'homme' when 'femmes' then 'femme'
    else token end,' ' order by ordinal),'')
  from regexp_split_to_table(trim(regexp_replace(regexp_replace(normalize(lower(left(coalesce(target_text,''),20000)),NFD),
    U&'[\0300-\036f]','','g'),'[^a-z0-9]+',' ','g')),' +') with ordinality word(token,ordinal)
  where token<>''
$$;
revoke all on function public.inspiration_search_normalized(text) from public;
grant execute on function public.inspiration_search_normalized(text) to anon,authenticated,service_role;

-- Search the complete PUBLIC feed before limiting/paginating, not just the
-- eight clips already downloaded. SECURITY INVOKER preserves all table/view RLS.
create function public.search_inspiration_feed(
  target_query text default '', target_category_id uuid default null,
  target_country_code text default '', target_provider_id uuid default null,
  target_zone text default '', target_latitude double precision default null,
  target_longitude double precision default null, target_radius_km integer default 5,
  before_published_at timestamptz default null, before_id uuid default null,
  page_size integer default 8
)
returns setof public.social_feed language plpgsql stable security invoker set search_path='' as $function$
declare
  query_words text[];
  zone_words text[];
  country_value text := upper(trim(coalesce(target_country_code,'')));
  -- CLDR French names from Intl.DisplayNames, matching catalog.countryName.
  country_names constant jsonb := $countries${"AC":"Île de l’Ascension","AD":"Andorre","AE":"Émirats arabes unis","AF":"Afghanistan","AG":"Antigua-et-Barbuda","AI":"Anguilla","AL":"Albanie","AM":"Arménie","AN":"Curaçao","AO":"Angola","AQ":"Antarctique","AR":"Argentine","AS":"Samoa américaines","AT":"Autriche","AU":"Australie","AW":"Aruba","AX":"Îles Åland","AZ":"Azerbaïdjan","BA":"Bosnie-Herzégovine","BB":"Barbade","BD":"Bangladesh","BE":"Belgique","BF":"Burkina Faso","BG":"Bulgarie","BH":"Bahreïn","BI":"Burundi","BJ":"Bénin","BL":"Saint-Barthélemy","BM":"Bermudes","BN":"Brunei","BO":"Bolivie","BQ":"Pays-Bas caribéens","BR":"Brésil","BS":"Bahamas","BT":"Bhoutan","BU":"Myanmar (Birmanie)","BV":"Île Bouvet","BW":"Botswana","BY":"Biélorussie","BZ":"Belize","CA":"Canada","CC":"Îles Cocos","CD":"Congo-Kinshasa","CF":"République centrafricaine","CG":"Congo-Brazzaville","CH":"Suisse","CI":"Côte d’Ivoire","CK":"Îles Cook","CL":"Chili","CM":"Cameroun","CN":"Chine","CO":"Colombie","CP":"Île Clipperton","CQ":"Sercq","CR":"Costa Rica","CS":"Serbie","CU":"Cuba","CV":"Cap-Vert","CW":"Curaçao","CX":"Île Christmas","CY":"Chypre","CZ":"Tchéquie","DD":"Allemagne","DE":"Allemagne","DG":"Diego Garcia","DJ":"Djibouti","DK":"Danemark","DM":"Dominique","DO":"République dominicaine","DY":"Bénin","DZ":"Algérie","EA":"Ceuta et Melilla","EC":"Équateur","EE":"Estonie","EG":"Égypte","EH":"Sahara occidental","ER":"Érythrée","ES":"Espagne","ET":"Éthiopie","EU":"Union européenne","EZ":"zone euro","FI":"Finlande","FJ":"Fidji","FK":"Îles Malouines","FM":"Micronésie","FO":"Îles Féroé","FR":"France","FX":"France","GA":"Gabon","GB":"Royaume-Uni","GD":"Grenade","GE":"Géorgie","GF":"Guyane française","GG":"Guernesey","GH":"Ghana","GI":"Gibraltar","GL":"Groenland","GM":"Gambie","GN":"Guinée","GP":"Guadeloupe","GQ":"Guinée équatoriale","GR":"Grèce","GS":"Géorgie du Sud-et-les Îles Sandwich du Sud","GT":"Guatemala","GU":"Guam","GW":"Guinée-Bissau","GY":"Guyana","HK":"R.A.S. chinoise de Hong Kong","HM":"Îles Heard-et-MacDonald","HN":"Honduras","HR":"Croatie","HT":"Haïti","HU":"Hongrie","HV":"Burkina Faso","IC":"Îles Canaries","ID":"Indonésie","IE":"Irlande","IL":"Israël","IM":"Île de Man","IN":"Inde","IO":"Territoire britannique de l’océan Indien","IQ":"Irak","IR":"Iran","IS":"Islande","IT":"Italie","JE":"Jersey","JM":"Jamaïque","JO":"Jordanie","JP":"Japon","KE":"Kenya","KG":"Kirghizstan","KH":"Cambodge","KI":"Kiribati","KM":"Comores","KN":"Saint-Christophe-et-Niévès","KP":"Corée du Nord","KR":"Corée du Sud","KW":"Koweït","KY":"Îles Caïmans","KZ":"Kazakhstan","LA":"Laos","LB":"Liban","LC":"Sainte-Lucie","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lituanie","LU":"Luxembourg","LV":"Lettonie","LY":"Libye","MA":"Maroc","MC":"Monaco","MD":"Moldavie","ME":"Monténégro","MF":"Saint-Martin","MG":"Madagascar","MH":"Îles Marshall","MK":"Macédoine du Nord","ML":"Mali","MM":"Myanmar (Birmanie)","MN":"Mongolie","MO":"R.A.S. chinoise de Macao","MP":"Îles Mariannes du Nord","MQ":"Martinique","MR":"Mauritanie","MS":"Montserrat","MT":"Malte","MU":"Maurice","MV":"Maldives","MW":"Malawi","MX":"Mexique","MY":"Malaisie","MZ":"Mozambique","NA":"Namibie","NC":"Nouvelle-Calédonie","NE":"Niger","NF":"Île Norfolk","NG":"Nigeria","NH":"Vanuatu","NI":"Nicaragua","NL":"Pays-Bas","NO":"Norvège","NP":"Népal","NR":"Nauru","NU":"Niue","NZ":"Nouvelle-Zélande","OM":"Oman","PA":"Panama","PE":"Pérou","PF":"Polynésie française","PG":"Papouasie-Nouvelle-Guinée","PH":"Philippines","PK":"Pakistan","PL":"Pologne","PM":"Saint-Pierre-et-Miquelon","PN":"Îles Pitcairn","PR":"Porto Rico","PS":"Territoires palestiniens","PT":"Portugal","PW":"Palaos","PY":"Paraguay","QA":"Qatar","QO":"régions éloignées de l’Océanie","RE":"La Réunion","RH":"Zimbabwe","RO":"Roumanie","RS":"Serbie","RU":"Russie","RW":"Rwanda","SA":"Arabie saoudite","SB":"Îles Salomon","SC":"Seychelles","SD":"Soudan","SE":"Suède","SG":"Singapour","SH":"Sainte-Hélène","SI":"Slovénie","SJ":"Svalbard et Jan Mayen","SK":"Slovaquie","SL":"Sierra Leone","SM":"Saint-Marin","SN":"Sénégal","SO":"Somalie","SR":"Suriname","SS":"Soudan du Sud","ST":"Sao Tomé-et-Principe","SU":"Russie","SV":"Salvador","SX":"Saint-Martin (partie néerlandaise)","SY":"Syrie","SZ":"Eswatini","TA":"Tristan da Cunha","TC":"Îles Turques-et-Caïques","TD":"Tchad","TF":"Terres australes françaises","TG":"Togo","TH":"Thaïlande","TJ":"Tadjikistan","TK":"Tokelau","TL":"Timor oriental","TM":"Turkménistan","TN":"Tunisie","TO":"Tonga","TP":"Timor oriental","TR":"Turquie","TT":"Trinité-et-Tobago","TV":"Tuvalu","TW":"Taïwan","TZ":"Tanzanie","UA":"Ukraine","UG":"Ouganda","UK":"Royaume-Uni","UM":"Îles mineures éloignées des États-Unis","UN":"Nations Unies","US":"États-Unis","UY":"Uruguay","UZ":"Ouzbékistan","VA":"État de la Cité du Vatican","VC":"Saint-Vincent-et-les Grenadines","VD":"Viêt Nam","VE":"Venezuela","VG":"Îles Vierges britanniques","VI":"Îles Vierges des États-Unis","VN":"Viêt Nam","VU":"Vanuatu","WF":"Wallis-et-Futuna","WS":"Samoa","XA":"pseudo-accents","XB":"pseudo-bidi","XK":"Kosovo","YD":"Yémen","YE":"Yémen","YT":"Mayotte","YU":"Serbie","ZA":"Afrique du Sud","ZM":"Zambie","ZR":"Congo-Kinshasa","ZW":"Zimbabwe"}$countries$::jsonb;
begin
  if char_length(coalesce(target_query,''))>120 or char_length(coalesce(target_zone,''))>120
    or (country_value<>'' and country_value!~'^[A-Z]{2}$')
    or page_size is null or page_size<1 or page_size>50
    or target_radius_km is null or target_radius_km not in (2,5,10,20)
    or (target_latitude is null)<>(target_longitude is null)
    or (target_latitude is not null and (not target_latitude between -90 and 90 or not target_longitude between -180 and 180))
    or (before_published_at is null)<>(before_id is null) then
    raise exception 'Filtres de découverte invalides' using errcode='22023';
  end if;
  select coalesce(array_agg(word),'{}'::text[]) into query_words
    from unnest(string_to_array(public.inspiration_search_normalized(target_query),' ')) word
    where word<>'' and word not in ('a','au','aux','de','des','du','en','pres','moi');
  select coalesce(array_agg(word),'{}'::text[]) into zone_words
    from unnest(string_to_array(public.inspiration_search_normalized(target_zone),' ')) word
    where word<>'' and word not in ('a','au','aux','de','des','du','en','pres','moi');
  return query
  with candidates as (
    select f as feed,ps.id as known_service,service.category_id,
      coalesce(b.country_code,pp.country_code)::text as country_code,
      case when b.latitude is not null and b.longitude is not null then b.latitude else pp.latitude end as latitude,
      case when b.latitude is not null and b.longitude is not null then b.longitude else pp.longitude end as longitude,
      public.inspiration_search_normalized(case
        when f.provider_service_id is null then f.city
        when ps.id is null then ''
        else concat_ws(' ',b.area,coalesce(b.city,pp.city),b.address,
          country_names->>coalesce(b.country_code,pp.country_code)::text) end) as normalized_place,
      public.inspiration_search_normalized(concat_ws(' ',f.business_name,f.service_title,f.caption,f.city,
        array_to_string(f.hashtags,' '),case when ps.id is not null then coalesce(b.name,pp.business_name) end,
        ps.title,category.name,case when ps.id is not null then country_names->>coalesce(b.country_code,pp.country_code)::text end,
        case when ps.id is not null then concat_ws(' ',b.area,coalesce(b.city,pp.city),b.address) end)) as normalized_text
    from public.social_feed f
    left join public.provider_services ps on ps.id=f.provider_service_id and ps.provider_id=f.author_id
    left join public.provider_profiles pp on pp.profile_id=ps.provider_id
    left join public.businesses b on b.id=ps.business_id
    left join public.services service on service.id=ps.service_id
    left join public.categories category on category.id=service.category_id
    where (target_provider_id is null or f.author_id=target_provider_id)
      and (before_published_at is null or (f.published_at,f.id)<(before_published_at,before_id))
  )
  select (c.feed).* from candidates c
  where (target_category_id is null or c.known_service is not null and c.category_id=target_category_id)
    and (country_value='' or c.known_service is not null and c.country_code=country_value)
    and not exists(select 1 from unnest(query_words) word where position(word in c.normalized_text)=0)
    and (target_latitude is not null or not exists(select 1 from unnest(zone_words) word where position(word in c.normalized_place)=0))
    and (target_latitude is null or c.known_service is not null
      and c.latitude between -90 and 90 and c.longitude between -180 and 180
      and 6371*2*asin(sqrt(least(1::double precision,greatest(0::double precision,
        power(sin(radians(c.latitude-target_latitude)/2),2)
        +cos(radians(target_latitude))*cos(radians(c.latitude))*power(sin(radians(c.longitude-target_longitude)/2),2)))))<=target_radius_km)
  order by (c.feed).published_at desc,(c.feed).id desc
  limit page_size;
end
$function$;
revoke all on function public.search_inspiration_feed(text,uuid,text,uuid,text,double precision,double precision,integer,timestamptz,uuid,integer) from public;
grant execute on function public.search_inspiration_feed(text,uuid,text,uuid,text,double precision,double precision,integer,timestamptz,uuid,integer) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
