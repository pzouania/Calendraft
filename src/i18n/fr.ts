// Textes du site en français : c'est la langue de référence. Les fichiers en.ts et de.ts doivent contenir
// exactement les mêmes clés (le compilateur signale toute clé manquante ou en trop).
//
// - Un texte simple est une chaîne. {nom} est remplacé par la valeur donnée à t('clé', { nom: ... }).
// - Un texte qui varie avec un nombre est un objet { one, other } choisi d'après { count } (règles de la langue).

export type Message = string | { one: string; other: string }

export const fr = {
  // Boutons couleur, langue et mode sombre (barre du haut)
  'appearance.close': 'Fermer',
  'appearance.colorButton': 'Couleur du thème',
  'appearance.languageButton': 'Changer de langue',
  'appearance.mode.toDark': 'Passer en mode sombre',
  'appearance.mode.toLight': 'Passer en mode clair',
  'appearance.color': 'Couleur',
  'appearance.colorAria': 'Thème {color}',
  'appearance.color.blue': 'Bleu',
  'appearance.color.violet': 'Violet',
  'appearance.color.green': 'Vert',
  'appearance.color.pink': 'Rose',
  'appearance.color.graphite': 'Graphite',
  'appearance.language': 'Langue',

  // Mots communs
  'common.cancel': 'Annuler',

  // Connexion, inscription, mot de passe oublié
  'auth.hero.title': 'Vos calendriers personnalisés, enfin simples à créer.',
  'auth.hero.subtitle': 'Définissez vos périodes récurrentes une seule fois, Calendraft génère et met à jour tout le reste.',
  'auth.feature.recurring.title': 'Périodes récurrentes',
  'auth.feature.recurring.desc': 'Garde alternée, plannings 3x8, horaires personnalisés — configurez une fois, répété automatiquement.',
  'auth.feature.year.title': 'Calendrier annuel',
  'auth.feature.year.desc': "Visualisez vos 12 mois en un coup d'œil, avec une vue détaillée heure par heure.",
  'auth.feature.pdf.title': 'Export PDF',
  'auth.feature.pdf.desc': 'Imprimez ou partagez votre calendrier en un clic, mis en page automatiquement.',
  'auth.tab.login': 'Connexion',
  'auth.tab.signup': 'Créer un compte',
  'auth.tab.forgot': 'Oublié',
  'auth.email': 'Email',
  'auth.password': 'Mot de passe',
  'auth.submit.loading': 'Chargement...',
  'auth.submit.login': 'Se connecter',
  'auth.submit.signup': "S'inscrire",
  'auth.submit.forgot': 'Envoyer le lien',
  'auth.or': 'ou',
  'auth.continueWith': 'Continuer avec {provider}',
  'auth.message.signedUp': 'Compte créé. Vous êtes connecté(e).',
  'auth.message.resetSent': 'Email de réinitialisation envoyé si ce compte existe.',
  'auth.footer.rights': '© {year} Calendraft. Tous droits réservés.',
  'auth.footer.terms': 'Conditions',
  'auth.footer.privacy': 'Confidentialité',
  'auth.footer.app': 'Application mobile',

  // Erreurs renvoyées par le service de connexion (les autres erreurs gardent le texte du serveur)
  'authError.invalidCredentials': 'Email ou mot de passe incorrect.',
  'authError.userExists': 'Un compte existe déjà avec cet email.',
  'authError.passwordTooShort': 'Le mot de passe doit faire au moins {min} caractères.',
  'authError.emailNotConfirmed': 'Email non confirmé. Vérifiez votre boîte de réception.',
  'authError.retryAfter': { one: 'Trop de tentatives. Réessayez dans {count} seconde.', other: 'Trop de tentatives. Réessayez dans {count} secondes.' },
  'authError.emailRateLimit': "Trop d'emails envoyés. Réessayez dans quelques minutes.",
  'authError.requestRateLimit': 'Trop de demandes. Réessayez dans quelques minutes.',
  'authError.samePassword': "Le nouveau mot de passe doit être différent de l'ancien.",
  'authError.network': 'Connexion impossible. Vérifiez votre connexion internet.',

  // Nouveau mot de passe (lien reçu par email)
  'reset.intro': 'Choisissez votre nouveau mot de passe.',
  'reset.newPassword': 'Nouveau mot de passe',
  'reset.confirmPassword': 'Confirmer le mot de passe',
  'reset.submit': 'Mettre à jour le mot de passe',
  'reset.saving': 'Enregistrement...',
  'reset.mismatch': 'Les deux mots de passe ne correspondent pas.',
  'reset.success': 'Mot de passe mis à jour avec succès.',
  'reset.successHint': 'Vous pouvez fermer cette page et vous reconnecter avec votre nouveau mot de passe.',

  // Suppression du compte
  'deleteAccount.title': 'Supprimer mon compte',
  'deleteAccount.intro.before': 'Cette action est ',
  'deleteAccount.intro.strong': 'définitive',
  'deleteAccount.intro.after': ' et ne peut pas être annulée. Seront effacés :',
  'deleteAccount.item.account': 'votre compte et votre photo de profil ;',
  'deleteAccount.item.calendars': "tous les calendriers que vous avez créés, avec leurs événements et l'emploi du temps importé ;",
  'deleteAccount.item.shares': 'vos liens de partage et les accès que vous aviez donnés.',
  'deleteAccount.warning': "Les personnes avec qui vous partagez vos calendriers les perdront aussi. Pensez à les exporter en PDF avant de continuer. Les calendriers que d'autres ont partagés avec vous ne sont pas touchés.",
  'deleteAccount.confirmWord': 'SUPPRIMER',
  'deleteAccount.confirmLabel': 'Pour confirmer, tapez {word}',
  'deleteAccount.error.photoCheck': 'Impossible de vérifier votre photo de profil : {detail}',
  'deleteAccount.error.photoRemove': 'Impossible de supprimer votre photo de profil : {detail}',
  'deleteAccount.error.failed': 'La suppression a échoué : {detail}',
  'deleteAccount.busy': 'Suppression...',
  'deleteAccount.confirm': 'Supprimer définitivement',
  'deleteAccount.done': 'Votre compte a été supprimé.',

  // Mots communs (suite)
  'common.back': 'Retour',
  'common.backToApp': 'Retour à Calendraft',
  'common.save': 'Enregistrer',
  'common.edit': 'Modifier',
  'common.signOut': 'Se déconnecter',

  // Mon profil
  'profile.title': 'Mon profil',
  'profile.avatar.alt': 'Photo de profil',
  'profile.avatar.uploading': 'Envoi de la photo...',
  'profile.avatar.notImage': 'Le fichier doit être une image.',
  'profile.avatar.tooBig': 'Image trop lourde (2 Mo maximum).',
  'profile.username': "Nom d'utilisateur",
  'profile.usernamePlaceholder': 'Votre nom affiché',
  'profile.usernameSaved': "Nom d'utilisateur mis à jour.",
  'profile.resetPassword': 'Réinitialiser mon mot de passe',
  'profile.resetSent': 'Email de réinitialisation envoyé.',
  'profile.appLink': 'Application mobile (Android et iPhone)',
  'profile.deleteAccount': 'Supprimer mon compte',

  // Mon profil : rappels (notifications)
  'profile.push.title': 'Rappels sur cet appareil',
  'profile.push.intro': "Activez les notifications pour recevoir vos rappels d'événements. Chaque appareil (téléphone, ordinateur) s'active séparément. Le rappel de chaque événement se choisit dans l'onglet Événements d'un calendrier.",
  'profile.push.checking': 'Vérification en cours...',
  'profile.push.ios.text': "Sur iPhone, les rappels fonctionnent uniquement depuis l'application ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent). Ouvrez calendraft.fr dans Safari, touchez Partager, puis « Sur l'écran d'accueil ».",
  'profile.push.ios.link': 'Voir les explications',
  'profile.push.noServiceWorker': 'Les rappels ne sont pas disponibles dans cette fenêtre. Ouvrez Calendraft sur calendraft.fr puis actualisez la page.',
  'profile.push.noPush': 'Ce navigateur ne gère pas les notifications. Essayez avec Chrome, Edge ou Firefox.',
  'profile.push.denied': "Les notifications sont bloquées pour Calendraft. Autorisez-les dans les réglages du navigateur (le cadenas à côté de l'adresse, puis Notifications), puis actualisez cette page.",
  'profile.push.enable': 'Activer les rappels sur cet appareil',
  'profile.push.enabling': 'Activation...',
  'profile.push.on': 'Les rappels sont activés sur cet appareil.',
  'profile.push.disable': 'Désactiver',
  'profile.push.enabledNote': 'Rappels activés sur cet appareil.',
  'profile.push.disabledNote': 'Rappels désactivés sur cet appareil.',
  'profile.push.error.disableFailed': 'La désactivation a échoué. Réessayez dans un instant.',
  'profile.push.error.denied': 'Les notifications sont bloquées pour Calendraft. Autorisez-les dans les réglages du navigateur, puis réessayez.',
  'profile.push.error.dismissed': "L'autorisation n'a pas été accordée. Réessayez et touchez Autoriser quand le navigateur le demande.",
  'profile.push.error.notConfigured': "Le serveur d'envoi n'est pas encore configuré (clés de notification manquantes).",
  'profile.push.error.registerFailed': "Cet appareil n'a pas pu être enregistré. Réessayez dans un instant.",
  'profile.push.error.unsupported': 'Les notifications ne sont pas disponibles dans cette fenêtre.',
  'profile.push.error.generic': "Impossible d'activer les notifications sur cet appareil.",

  // Page « Application mobile »
  'app.yourDevice': 'Votre appareil',
  'app.title': 'Calendraft sur votre téléphone',
  'app.intro': 'Retrouvez vos calendriers comme dans une vraie application, gratuite, depuis l’écran d’accueil de votre téléphone.',
  'app.android.intro': 'Installez le fichier d’application (APK) : Calendraft s’ouvre en plein écran, avec son icône sur l’écran d’accueil.',
  'app.android.download': 'Télécharger pour Android',
  'app.android.fileInfo': 'Fichier APK, environ 1,5 Mo',
  'app.android.step1.title': 'Téléchargez le fichier',
  'app.android.step1.text': 'Appuyez sur le bouton ci-dessus. Votre navigateur peut demander de confirmer le téléchargement : acceptez.',
  'app.android.step2.title': 'Ouvrez le fichier',
  'app.android.step2.text': 'Ouvrez «\u00A0Calendraft.apk\u00A0» depuis la notification de téléchargement ou depuis l’application Fichiers.',
  'app.android.step3.title': 'Autorisez l’installation',
  'app.android.step3.text': 'Android peut demander d’autoriser l’installation depuis cette source (votre navigateur ou Fichiers). Activez l’option pour cette fois.',
  'app.android.step4.title': 'Passez l’avertissement',
  'app.android.step4.text': 'Si Play Protect affiche un avertissement, choisissez «\u00A0Installer quand même\u00A0» : l’application n’est pas distribuée par le Play Store.',
  'app.ios.title': 'iPhone et iPad',
  'app.ios.intro': 'Apple n’autorise pas l’installation de fichiers d’application en dehors de l’App Store. Ajoutez simplement Calendraft à l’écran d’accueil : vous obtenez la même application, en plein écran et avec son icône.',
  'app.ios.step1.title': 'Ouvrez calendraft.fr dans Safari',
  'app.ios.step1.text': 'L’ajout à l’écran d’accueil ne fonctionne que depuis Safari.',
  'app.ios.step2.title': 'Appuyez sur Partager',
  'app.ios.step2.text': 'C’est le bouton carré avec une flèche vers le haut, en bas de l’écran (en haut sur iPad).',
  'app.ios.step3.title': 'Choisissez «\u00A0Sur l’écran d’accueil\u00A0»',
  'app.ios.step3.text': 'Faites défiler la liste des actions si besoin, puis appuyez sur Ajouter. L’icône Calendraft apparaît avec vos autres applications.',
  'app.know.title': 'À savoir',
  'app.know.text1': 'L’application affiche calendraft.fr : vos calendriers sont toujours à jour, sans réinstaller. Une connexion internet est nécessaire.',
  'app.know.text2': 'Sur ordinateur, Chrome et Edge proposent aussi «\u00A0Installer Calendraft\u00A0» dans la barre d’adresse.',

  // Exemple de texte qui varie avec un nombre (utilisé plus tard dans le calendrier)
  'calendar.eventsCount': { one: '{count} événement', other: '{count} événements' },
} satisfies Record<string, Message>

export type TranslationKey = keyof typeof fr
