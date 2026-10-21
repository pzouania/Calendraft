import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

const PUBLISHER = 'étudiant '
const CONTACT_EMAIL = 'calendraft.help@gmail.com'
const LAST_UPDATE = '8 octobre 2026'

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: 'Objet',
    paragraphs: [
      `Calendraft (calendraft.fr), édité par un ${PUBLISHER}, est un service en ligne gratuit qui permet de créer des calendriers personnalisés à partir de périodes récurrentes, de les consulter, de les partager et de les exporter en PDF. En utilisant le service, vous acceptez les présentes conditions.`,
    ],
  },
  {
    title: 'Votre compte',
    paragraphs: [
      'Pour enregistrer des calendriers, vous devez créer un compte avec une adresse email valide, ou vous connecter avec Google ou GitHub. Vous êtes responsable de la confidentialité de vos identifiants et de l’activité réalisée depuis votre compte.',
      'Vous devez fournir une adresse email dont vous êtes le titulaire.',
    ],
  },
  {
    title: 'Utilisation du service',
    paragraphs: [
      'Vous vous engagez à utiliser Calendraft de façon loyale, et notamment à ne pas : perturber ou surcharger le service, tenter d’accéder aux données d’autres utilisateurs, contourner les mesures de sécurité, ou y déposer des contenus illicites ou portant atteinte aux droits de tiers.',
      'Nous pouvons suspendre ou supprimer un compte qui ne respecterait pas ces règles.',
    ],
  },
  {
    title: 'Vos contenus et le partage',
    paragraphs: [
      'Les calendriers, périodes et autres contenus que vous créez vous appartiennent. Vous nous autorisez seulement à les stocker et à les afficher pour faire fonctionner le service, selon vos choix de partage.',
      'Lorsque vous invitez une personne par email ou que vous créez un lien de partage, vous décidez qui peut voir ou modifier votre calendrier. Vous êtes responsable de ces choix : toute personne possédant un lien actif peut consulter le calendrier correspondant. Vous pouvez retirer un accès ou désactiver un lien à tout moment.',
    ],
  },
  {
    title: 'Disponibilité du service',
    paragraphs: [
      'Calendraft est fourni gratuitement et « en l’état ». Nous faisons le maximum pour qu’il soit disponible et fiable, mais nous ne pouvons pas garantir l’absence d’interruptions, d’erreurs ou de pertes de données. Il est conseillé d’exporter régulièrement en PDF les calendriers importants.',
      'Le service peut évoluer, être modifié ou interrompu, y compris de façon définitive.',
    ],
  },
  {
    title: 'Responsabilité',
    paragraphs: [
      'Dans les limites permises par la loi, nous ne sommes pas responsables des dommages indirects liés à l’utilisation du service, notamment d’une décision prise sur la base d’un calendrier (garde, planning de travail, etc.). Il vous appartient de vérifier l’exactitude des informations que vous saisissez et des calendriers générés.',
      'Ces conditions ne limitent aucun droit que la loi vous reconnaît impérativement.',
    ],
  },
  {
    title: 'Suppression du compte',
    paragraphs: [
      `Vous pouvez supprimer votre compte à tout moment depuis la page « Mon profil » : votre compte et vos contenus sont alors effacés définitivement. Vous pouvez aussi en faire la demande en écrivant à ${CONTACT_EMAIL}. Le traitement de vos données est décrit dans notre politique de confidentialité.`,
    ],
  },
  {
    title: 'Modification des conditions',
    paragraphs: [
      'Nous pouvons modifier ces conditions. La date de dernière mise à jour figure en haut de cette page. La poursuite de l’utilisation du service après une modification vaut acceptation des nouvelles conditions.',
    ],
  },
  {
    title: 'Droit applicable',
    paragraphs: [
      'Ces conditions sont soumises au droit français. Pour toute question, contactez-nous à l’adresse indiquée dans la politique de confidentialité.',
    ],
  },
]

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--header-bg)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-header)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div className="header-logo" style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center' }}>
          <Logo height={32} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <ThemeToggle />
          <a
            href="/"
            style={{
              background: 'var(--header-btn-bg)', color: 'var(--header-btn-text)', boxShadow: 'inset 0 0 0 1px var(--header-btn-ring)', borderRadius: 999,
              padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
            }}
          >
            Retour à Calendraft
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1.5rem 3rem' }}>
        <div
          style={{
            background: 'var(--surface)', borderRadius: 16, padding: '2rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <h1 style={{ margin: '0 0 0.3rem', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
            Conditions d’utilisation
          </h1>
          <p style={{ margin: '0 0 1.8rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Dernière mise à jour : {LAST_UPDATE}
          </p>

          {SECTIONS.map((s) => (
            <section key={s.title} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{s.title}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: '0 0 0.6rem', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-strong)' }}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Voir aussi notre <a href="/confidentialite" style={{ color: 'var(--accent-link)' }}>politique de confidentialité</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
