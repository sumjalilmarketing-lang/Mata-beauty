import { feedText } from "./feed-copy";

const copy: Record<string, readonly [string, string]> = {
  "réservation rapide": ["quick booking", "reserva rápida"],
  "Étape": ["Step", "Paso"], "sur": ["of", "de"], "Créneau": ["Time slot", "Hora"], "Confirmation": ["Confirmation", "Confirmación"],
  "Quand êtes-vous disponible ?": ["When are you available?", "¿Cuándo tienes disponibilidad?"],
  "Heure locale de l’établissement": ["Establishment local time", "Hora local del establecimiento"],
  "Aujourd’hui": ["Today", "Hoy"], "Autre": ["Other", "Otra"], "Choisir une autre date": ["Choose another date", "Elegir otra fecha"],
  "Choisir mon professionnel": ["Choose my professional", "Elegir mi profesional"],
  "Peu importe, attribuez-moi un professionnel disponible": ["Assign any available professional", "Asignar cualquier profesional disponible"],
  "Créneaux disponibles": ["Available time slots", "Horas disponibles"], "Mis à jour en direct": ["Updated live", "Actualización en directo"],
  "Recherche des meilleurs créneaux…": ["Finding available time slots…", "Buscando horas disponibles…"],
  "Les disponibilités n’ont pas pu être chargées. Vérifiez votre connexion.": ["Availability could not be loaded. Check your connection.", "No se ha podido cargar la disponibilidad. Comprueba tu conexión."],
  "Aucun créneau publié ce jour. Essayez une autre date.": ["No time slots published for this day. Try another date.", "No hay horas publicadas para este día. Prueba otra fecha."],
  "Actualiser les disponibilités": ["Refresh availability", "Actualizar disponibilidad"],
  "Vérifiez et confirmez": ["Review and confirm", "Revisa y confirma"], "à": ["at", "a las"],
  "Professionnel :": ["Professional:", "Profesional:"],
  "Affectation automatique à une personne qualifiée et disponible": ["Automatically assigned to a qualified, available professional", "Asignación automática a un profesional cualificado y disponible"],
  "Où ?": ["Where?", "¿Dónde?"], "Chez le professionnel": ["At the establishment", "En el establecimiento"],
  "adresse à confirmer avec le professionnel": ["address to confirm with the professional", "dirección por confirmar con el profesional"],
  "À mon domicile": ["At my home", "En mi domicilio"], "Le professionnel se déplace": ["The professional comes to you", "El profesional se desplaza"],
  "Adresse": ["Address", "Dirección"], "Votre adresse complète": ["Your full address", "Tu dirección completa"],
  "Paiement": ["Payment", "Pago"], "Sur place": ["On site", "En el establecimiento"], "Aucun débit aujourd’hui": ["No charge today", "Sin cobro hoy"],
  "Wave · Paiement de démonstration": ["Wave · Demo payment", "Wave · Pago de demostración"],
  "Orange Money · Paiement de démonstration": ["Orange Money · Demo payment", "Orange Money · Pago de demostración"],
  "Carte · Paiement de démonstration": ["Card · Demo payment", "Tarjeta · Pago de demostración"],
  "PayDunya Sandbox · aucun argent réel": ["PayDunya Sandbox · no real money", "PayDunya Sandbox · sin dinero real"],
  "PayDunya Sandbox · aucune carte réelle": ["PayDunya Sandbox · no real card", "PayDunya Sandbox · sin tarjeta real"],
  "Wave, Orange Money ou carte": ["Wave, Orange Money or card", "Wave, Orange Money o tarjeta"],
  "Vérification…": ["Checking…", "Comprobando…"], "Le paiement en ligne n’est pas encore disponible": ["Online payment is not yet available", "El pago en línea aún no está disponible"],
  "Politique d’annulation et note": ["Cancellation policy and note", "Política de cancelación y nota"],
  "Votre demande reste en attente de confirmation du professionnel. Aucun montant ne sera débité en ligne.": ["Your request awaits confirmation by the professional. No amount will be charged online.", "Tu solicitud queda pendiente de confirmación del profesional. No se cobrará ningún importe en línea."],
  "Note": ["Note", "Nota"], "Précision utile pour le professionnel": ["Useful information for the professional", "Información útil para el profesional"],
  "Paiement sur place · aucun débit aujourd’hui.": ["Pay on site · no charge today.", "Pago en el establecimiento · sin cobro hoy."],
  "Paiement de démonstration · aucun argent réel.": ["Demo payment · no real money.", "Pago de demostración · sin dinero real."],
  "Enregistrement…": ["Saving…", "Guardando…"], "Confirmer · ": ["Confirm · ", "Confirmar · "],
  "Continuer vers la sandbox · ": ["Continue to sandbox · ", "Continuar a la sandbox · "],
  "Demande enregistrée": ["Request saved", "Solicitud guardada"], "Votre rendez-vous est créé": ["Your appointment has been created", "Tu cita se ha creado"],
  "Votre intervenant": ["Your assigned professional", "Tu profesional asignado"],
  "Votre professionnel sera confirmé par le salon.": ["The salon will confirm your professional.", "El salón confirmará tu profesional."],
  "Date": ["Date", "Fecha"], "Prix": ["Price", "Precio"], "Statut": ["Status", "Estado"],
  "À régler sur place · aucun débit en ligne": ["Pay on site · no online charge", "Pago en el establecimiento · sin cobro en línea"],
  "En attente de confirmation du professionnel": ["Awaiting confirmation by the professional", "Pendiente de confirmación del profesional"],
  "Message": ["Message", "Mensaje"], "Itinéraire": ["Directions", "Cómo llegar"], "Ajouter au calendrier": ["Add to calendar", "Añadir al calendario"], "Terminer": ["Done", "Terminar"],
  "Votre réservation a-t-elle été simple ?": ["Was your booking easy?", "¿Ha sido fácil hacer la reserva?"], "Merci pour votre retour.": ["Thank you for your feedback.", "Gracias por tu opinión."],
  "👍 Oui": ["👍 Yes", "👍 Sí"], "👎 Non": ["👎 No", "👎 No"],
  "Rendez-vous": ["Appointments", "Citas"], "Messages": ["Messages", "Mensajes"], "Se connecter": ["Sign in", "Iniciar sesión"],
  "Se connecter à MATA Beauty": ["Sign in to MATA Beauty", "Iniciar sesión en MATA Beauty"], "Navigation de l’application": ["Application navigation", "Navegación de la aplicación"],
};

export function applicationLocale(locale: string): string {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return language === "en" ? "en-US" : language === "es" ? "es-ES" : "fr-FR";
}

export function bookingText(text: string, locale: string): string {
  const language = applicationLocale(locale);
  const translated = copy[text];
  return translated && language !== "fr-FR" ? translated[language === "en-US" ? 0 : 1] : feedText(text, locale);
}
