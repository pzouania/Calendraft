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

  // Exemple de texte qui varie avec un nombre (utilisé plus tard dans le calendrier)
  'calendar.eventsCount': { one: '{count} événement', other: '{count} événements' },
} satisfies Record<string, Message>

export type TranslationKey = keyof typeof fr
