import { applicationText } from "./application-copy";
import { applicationLocale } from "./booking-copy";

const copy: Record<string, readonly [string, string]> = {
  "Espace actif": [
    "Active workspace",
    "Espacio activo"
  ],
  "Espace client": [
    "Client workspace",
    "Espacio de cliente"
  ],
  "Espace professionnel": [
    "Professional workspace",
    "Espacio profesional"
  ],
  "Espace salon": [
    "Salon workspace",
    "Espacio del salón"
  ],
  "Espace employé": [
    "Staff workspace",
    "Espacio del colaborador"
  ],
  "Votre beauté": [
    "Your beauty",
    "Tu belleza"
  ],
  "Votre activité": [
    "Your activity",
    "Tu actividad"
  ],
  "Votre établissement": [
    "Your establishment",
    "Tu establecimiento"
  ],
  "Votre activité au salon": [
    "Your work at the salon",
    "Tu actividad en el salón"
  ],
  "Navigation": [
    "Navigation",
    "Navegación"
  ],
  "Essentiel": [
    "Essentials",
    "Esencial"
  ],
  "Activité": [
    "Activity",
    "Actividad"
  ],
  "Bibliothèque": [
    "Library",
    "Biblioteca"
  ],
  "Compte": [
    "Account",
    "Cuenta"
  ],
  "Pilotage": [
    "Management",
    "Gestión"
  ],
  "Relations": [
    "Relationships",
    "Relaciones"
  ],
  "Offre": [
    "Services",
    "Servicios"
  ],
  "Contenu": [
    "Content",
    "Contenido"
  ],
  "Organisation": [
    "Organisation",
    "Organización"
  ],
  "Finance": [
    "Finance",
    "Finanzas"
  ],
  "Mon activité": [
    "My activity",
    "Mi actividad"
  ],
  "Se déconnecter": [
    "Sign out",
    "Cerrar sesión"
  ],
  "Rechercher dans ce module": [
    "Search this module",
    "Buscar en este módulo"
  ],
  "Rechercher…": [
    "Search…",
    "Buscar…"
  ],
  "Notifications": [
    "Notifications",
    "Notificaciones"
  ],
  "Mon compte": [
    "My account",
    "Mi cuenta"
  ],
  "Dans cette rubrique": [
    "In this section",
    "En esta sección"
  ],
  "Navigation secondaire": [
    "Secondary navigation",
    "Navegación secundaria"
  ],
  "Navigation mobile": [
    "Mobile navigation",
    "Navegación móvil"
  ],
  "Plus": [
    "More",
    "Más"
  ],
  "Réservations": [
    "Bookings",
    "Reservas"
  ],
  "Paiements": [
    "Payments",
    "Pagos"
  ],
  "Inspirations": [
    "Inspirations",
    "Inspiraciones"
  ],
  "Inspirations enregistrées": [
    "Saved inspirations",
    "Inspiraciones guardadas"
  ],
  "Favoris": [
    "Favourites",
    "Favoritos"
  ],
  "Avis": [
    "Reviews",
    "Opiniones"
  ],
  "Support": [
    "Support",
    "Soporte"
  ],
  "Paramètres": [
    "Settings",
    "Ajustes"
  ],
  "Mon équipe": [
    "My team",
    "Mi equipo"
  ],
  "Agenda": [
    "Calendar",
    "Agenda"
  ],
  "Prestations": [
    "Services",
    "Servicios"
  ],
  "Clientes": [
    "Clients",
    "Clientes"
  ],
  "Revenus": [
    "Revenue",
    "Ingresos"
  ],
  "Versements": [
    "Payouts",
    "Transferencias"
  ],
  "Statistiques": [
    "Statistics",
    "Estadísticas"
  ],
  "Profil public": [
    "Public profile",
    "Perfil público"
  ],
  "Agenda du salon": [
    "Salon calendar",
    "Agenda del salón"
  ],
  "Équipe": [
    "Team",
    "Equipo"
  ],
  "Postes et ressources": [
    "Stations and resources",
    "Puestos y recursos"
  ],
  "Profil du salon": [
    "Salon profile",
    "Perfil del salón"
  ],
  "Mon dashboard": [
    "My dashboard",
    "Mi panel"
  ],
  "Mon agenda": [
    "My calendar",
    "Mi agenda"
  ],
  "Mes rendez-vous": [
    "My appointments",
    "Mis citas"
  ],
  "Mes messages": [
    "My messages",
    "Mis mensajes"
  ],
  "Mes prestations": [
    "My services",
    "Mis servicios"
  ],
  "Votre dossier est en brouillon": [
    "Your application is a draft",
    "Tu solicitud está en borrador"
  ],
  "Complétez votre dossier": [
    "Complete your application",
    "Completa tu solicitud"
  ],
  "Votre dossier a été envoyé": [
    "Your application has been submitted",
    "Tu solicitud se ha enviado"
  ],
  "Votre dossier est en cours d’examen": [
    "Your application is under review",
    "Tu solicitud está en revisión"
  ],
  "Un complément est demandé": [
    "Additional information requested",
    "Se solicita información adicional"
  ],
  "Votre compte professionnel est approuvé": [
    "Your professional account is approved",
    "Tu cuenta profesional está aprobada"
  ],
  "Votre dossier a été refusé": [
    "Your application was declined",
    "Tu solicitud ha sido rechazada"
  ],
  "Votre activité est suspendue": [
    "Your business is suspended",
    "Tu actividad está suspendida"
  ],
  "Votre activité est désactivée": [
    "Your business is disabled",
    "Tu actividad está desactivada"
  ],
  "Votre dossier est en cours de traitement": [
    "Your application is being processed",
    "Tu solicitud se está tramitando"
  ],
  "Votre profil est momentanément indisponible.": [
    "Your profile is temporarily unavailable.",
    "Tu perfil no está disponible temporalmente."
  ],
  "Chargement de votre profil…": [
    "Loading your profile…",
    "Cargando tu perfil…"
  ],
  "Mon profil": [
    "My profile",
    "Mi perfil"
  ],
  "Mon profil client": [
    "My client profile",
    "Mi perfil de cliente"
  ],
  "Photo de profil": [
    "Profile photo",
    "Foto de perfil"
  ],
  "Initiales du profil": [
    "Profile initials",
    "Iniciales del perfil"
  ],
  "MON ESPACE PERSONNEL": [
    "MY PERSONAL SPACE",
    "MI ESPACIO PERSONAL"
  ],
  "Modifier mon profil": [
    "Edit my profile",
    "Editar mi perfil"
  ],
  "Profil social": [
    "Social profile",
    "Perfil social"
  ],
  "Enregistrés": [
    "Saved",
    "Guardados"
  ],
  "Mes rendez-vous et historique": [
    "My appointments and history",
    "Mis citas e historial"
  ],
  "Mes favoris": [
    "My favourites",
    "Mis favoritos"
  ],
  "Mes vidéos enregistrées": [
    "My saved videos",
    "Mis vídeos guardados"
  ],
  "Mes informations": [
    "My details",
    "Mis datos"
  ],
  "Ma candidature professionnelle": [
    "My professional application",
    "Mi solicitud profesional"
  ],
  "Vous êtes professionnel de la beauté ?": [
    "Are you a beauty professional?",
    "¿Eres profesional de la belleza?"
  ],
  "Ouvrir mon espace professionnel": [
    "Open my professional workspace",
    "Abrir mi espacio profesional"
  ],
  "Consulter mon dossier": [
    "View my application",
    "Consultar mi solicitud"
  ],
  "Devenir professionnel": [
    "Become a professional",
    "Hazte profesional"
  ],
  "Paramètres et confidentialité →": [
    "Settings and privacy →",
    "Ajustes y privacidad →"
  ],
  "Paramètres et confidentialité": [
    "Settings and privacy",
    "Ajustes y privacidad"
  ],
  "← Retour au profil": [
    "← Back to profile",
    "← Volver al perfil"
  ],
  "Compte et confidentialité": [
    "Account and privacy",
    "Cuenta y privacidad"
  ],
  "Mes paiements": [
    "My payments",
    "Mis pagos"
  ],
  "Mes avis": [
    "My reviews",
    "Mis opiniones"
  ],
  "Aide": [
    "Help",
    "Ayuda"
  ],
  "Identité": [
    "Identity",
    "Identidad"
  ],
  "Les coordonnées privées ne sont jamais affichées publiquement.": [
    "Private contact details are never displayed publicly.",
    "Los datos de contacto privados nunca se muestran públicamente."
  ],
  "Prénom": [
    "First name",
    "Nombre"
  ],
  "Nom": [
    "Last name",
    "Apellidos"
  ],
  "Nom d’utilisateur": [
    "Username",
    "Nombre de usuario"
  ],
  "Région / État": [
    "Region / state",
    "Región / estado"
  ],
  "Quartier": [
    "Neighbourhood",
    "Barrio"
  ],
  "Langue": [
    "Language",
    "Idioma"
  ],
  "Bio": [
    "Bio",
    "Biografía"
  ],
  "Préférences beauté": [
    "Beauty preferences",
    "Preferencias de belleza"
  ],
  "Utilisées uniquement pour personnaliser le feed lorsque vous l’autorisez.": [
    "Used only to personalise the feed when you allow it.",
    "Se usan solo para personalizar el feed cuando lo autorizas."
  ],
  "Catégories favorites": [
    "Favourite categories",
    "Categorías favoritas"
  ],
  "Styles préférés": [
    "Preferred styles",
    "Estilos preferidos"
  ],
  "Budget minimum": [
    "Minimum budget",
    "Presupuesto mínimo"
  ],
  "Budget maximum": [
    "Maximum budget",
    "Presupuesto máximo"
  ],
  "Rayon (km)": [
    "Radius (km)",
    "Radio (km)"
  ],
  "Lieu": [
    "Location",
    "Lugar"
  ],
  "Salon ou domicile": [
    "Salon or home",
    "Salón o domicilio"
  ],
  "Salon": [
    "Salon",
    "Salón"
  ],
  "Domicile": [
    "Home",
    "Domicilio"
  ],
  "Activer les recommandations personnalisées": [
    "Enable personalised recommendations",
    "Activar recomendaciones personalizadas"
  ],
  "Historique privé lié à vos réservations.": [
    "Private history linked to your bookings.",
    "Historial privado vinculado a tus reservas."
  ],
  "Prestation beauté": [
    "Beauty service",
    "Servicio de belleza"
  ],
  "Aucun paiement enregistré.": [
    "No payments recorded.",
    "No hay pagos registrados."
  ],
  "À payer": [
    "To pay",
    "Por pagar"
  ],
  "Confirmé (test)": [
    "Confirmed (test)",
    "Confirmado (prueba)"
  ],
  "Confirmé sur place": [
    "Confirmed on site",
    "Confirmado en el establecimiento"
  ],
  "Confirmé": [
    "Confirmed",
    "Confirmado"
  ],
  "Échoué": [
    "Failed",
    "Fallido"
  ],
  "Remboursé": [
    "Refunded",
    "Reembolsado"
  ],
  "Annulé": [
    "Cancelled",
    "Cancelado"
  ],
  "Aide et support": [
    "Help and support",
    "Ayuda y soporte"
  ],
  "Une demande privée suivie par l’équipe Mata Beauty.": [
    "A private request handled by the Mata Beauty team.",
    "Una solicitud privada atendida por el equipo de Mata Beauty."
  ],
  "Catégorie": [
    "Category",
    "Categoría"
  ],
  "Inscription": [
    "Registration",
    "Registro"
  ],
  "Publication": [
    "Publication",
    "Publicación"
  ],
  "Réservation": [
    "Booking",
    "Reserva"
  ],
  "Bug": [
    "Bug",
    "Error"
  ],
  "Objet (obligatoire)": [
    "Subject (required)",
    "Asunto (obligatorio)"
  ],
  "Décrivez brièvement votre demande": [
    "Briefly describe your request",
    "Describe brevemente tu solicitud"
  ],
  "Envoyer": [
    "Send",
    "Enviar"
  ],
  "Confidentialité et compte": [
    "Privacy and account",
    "Privacidad y cuenta"
  ],
  "Vos paiements, réservations, messages et tickets restent toujours privés.": [
    "Your payments, bookings, messages and support tickets remain private.",
    "Tus pagos, reservas, mensajes y solicitudes de soporte son privados."
  ],
  "Visibilité du profil": [
    "Profile visibility",
    "Visibilidad del perfil"
  ],
  "Limitée": [
    "Limited",
    "Limitada"
  ],
  "Publique": [
    "Public",
    "Pública"
  ],
  "Afficher mes collections": [
    "Show my collections",
    "Mostrar mis colecciones"
  ],
  "Afficher mes abonnements": [
    "Show who I follow",
    "Mostrar a quién sigo"
  ],
  "Recommandations personnalisées": [
    "Personalised recommendations",
    "Recomendaciones personalizadas"
  ],
  "Emails commerciaux": [
    "Marketing emails",
    "Correos comerciales"
  ],
  "Notifications promotionnelles": [
    "Promotional notifications",
    "Notificaciones promocionales"
  ],
  "Demander la suppression du compte": [
    "Request account deletion",
    "Solicitar la eliminación de la cuenta"
  ],
  "Profil mis à jour.": [
    "Profile updated.",
    "Perfil actualizado."
  ],
  "Le profil n’a pas pu être mis à jour.": [
    "Your profile could not be updated.",
    "No se ha podido actualizar tu perfil."
  ],
  "Photo mise à jour.": [
    "Photo updated.",
    "Foto actualizada."
  ],
  "Préférences enregistrées.": [
    "Preferences saved.",
    "Preferencias guardadas."
  ],
  "Confidentialité enregistrée.": [
    "Privacy settings saved.",
    "Ajustes de privacidad guardados."
  ],
  "Demande envoyée au support.": [
    "Request sent to support.",
    "Solicitud enviada a soporte."
  ],
  "Photo JPG, PNG ou WebP de 5 Mo maximum.": [
    "JPG, PNG or WebP photo, up to 5 MB.",
    "Foto JPG, PNG o WebP de hasta 5 MB."
  ],
  "Le service des avis est momentanément indisponible.": [
    "The reviews service is temporarily unavailable.",
    "El servicio de opiniones no está disponible temporalmente."
  ],
  "Les avis n’ont pas pu être chargés.": [
    "Reviews could not be loaded.",
    "No se han podido cargar las opiniones."
  ],
  "Le chargement des avis prend trop de temps. Réessayez.": [
    "Loading reviews is taking too long. Try again.",
    "Las opiniones tardan demasiado en cargar. Vuelve a intentarlo."
  ],
  "Demander la suppression du compte ? Cette demande sera vérifiée avant toute action irréversible.": [
    "Request account deletion? This request will be reviewed before any irreversible action.",
    "¿Solicitar la eliminación de la cuenta? La solicitud se revisará antes de cualquier acción irreversible."
  ],
  "Motif facultatif": [
    "Optional reason",
    "Motivo opcional"
  ],
  "Espace collaborateur": [
    "Staff workspace",
    "Espacio del colaborador"
  ],
  "Prestations autorisées": [
    "Authorised services",
    "Servicios autorizados"
  ],
  "Active": [
    "Active",
    "Activo"
  ],
  "Inactive": [
    "Inactive",
    "Inactivo"
  ],
  "Aucune prestation du salon ne vous est attribuée.": [
    "No salon services are assigned to you.",
    "No tienes servicios del salón asignados."
  ],
  "Seuls les rendez-vous attribués à votre compte sont affichés.": [
    "Only appointments assigned to your account are shown.",
    "Solo se muestran las citas asignadas a tu cuenta."
  ],
  "Semaine à partir du": [
    "Week starting",
    "Semana a partir del"
  ],
  "Les heures sont affichées selon le fuseau de chaque salon.": [
    "Times are shown in each salon’s timezone.",
    "Las horas se muestran en la zona horaria de cada salón."
  ],
  "Chargement des rendez-vous…": [
    "Loading appointments…",
    "Cargando citas…"
  ],
  "Aucun rendez-vous attribué pour cette période.": [
    "No appointments assigned for this period.",
    "No tienes citas asignadas para este periodo."
  ],
  "Confirmer": [
    "Confirm",
    "Confirmar"
  ],
  "Refuser": [
    "Decline",
    "Rechazar"
  ],
  "Démarrer": [
    "Start",
    "Iniciar"
  ],
  "En attente": [
    "Pending",
    "Pendiente"
  ],
  "En cours": [
    "In progress",
    "En curso"
  ],
  "Terminé": [
    "Completed",
    "Completado"
  ],
  "Refusé": [
    "Declined",
    "Rechazado"
  ],
  "Annulé par le client": [
    "Cancelled by the client",
    "Cancelado por el cliente"
  ],
  "Annulé par le salon": [
    "Cancelled by the salon",
    "Cancelado por el salón"
  ],
  "Absence": [
    "No-show",
    "Ausencia"
  ],
  "Litige": [
    "Dispute",
    "Disputa"
  ],
  "Les rendez-vous autorisés n’ont pas pu être chargés.": [
    "Your authorised appointments could not be loaded.",
    "No se han podido cargar tus citas autorizadas."
  ],
  "Cette transition n’est plus autorisée. Actualisez la liste.": [
    "This status change is no longer permitted. Refresh the list.",
    "Este cambio de estado ya no está permitido. Actualiza la lista."
  ],
  "Rendez-vous mis à jour.": [
    "Appointment updated.",
    "Cita actualizada."
  ],
  "Demande enregistrée. Aucune donnée n’est supprimée immédiatement.": [
    "Request saved. No data is deleted immediately.",
    "Solicitud guardada. No se elimina ningún dato de inmediato."
  ]
};

export function workspaceText(text: string, locale: string): string {
  const language = applicationLocale(locale);
  const value = copy[text];
  return value && language !== "fr-FR" ? value[language === "en-US" ? 0 : 1] : applicationText(text, locale);
}
