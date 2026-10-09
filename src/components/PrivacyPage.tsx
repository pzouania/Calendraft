import Logo from './Logo'

const PUBLISHER = 'étudiant '
const CONTACT_EMAIL = 'calendraft.help@gmail.com'
const LAST_UPDATE = '8 octobre 2026'

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: 'Qui édite Calendraft ?',
    paragraphs: [
      `Calendraft (calendraft.fr) est édité par un ${PUBLISHER}. Pour toute question sur vos données, écrivez à ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: 'Quelles données sont collectées ?',
    paragraphs: [
      'Votre adresse email, pour créer et identifier votre compte. Si vous choisissez un mot de passe, il est stocké sous forme chiffrée par notre fournisseur d’authentification : nous n’y avons pas accès.',
      'Facultativement, un nom d’utilisateur et une photo de profil.',
      'Si vous vous connectez avec Google ou GitHub, nous recevons l’adresse email, le nom et l’adresse de la photo de profil associés à ce compte. Nous n’accédons à aucune autre donnée de votre compte Google ou GitHub (contacts, agenda, dépôts, etc.).',
      'Le contenu que vous créez : vos calendriers, vos périodes, les jours retirés, ainsi que les adresses email des personnes avec lesquelles vous partagez un calendrier.',
    ],
  },
  {
    title: 'À quoi servent ces données ?',
    paragraphs: [
      'Uniquement à faire fonctionner le service : vous connecter, enregistrer et afficher vos calendriers, et les partager selon vos choix. Nous ne faisons ni publicité, ni profilage, et nous ne vendons ni ne cédons vos données.',
    ],
  },
  {
    title: 'Partage de calendriers',
    paragraphs: [
      'Un calendrier n’est visible que par vous, sauf si vous le partagez. Les personnes invitées par email voient son contenu avec les droits que vous leur avez donnés (lecture ou modification). Toute personne possédant un lien de partage peut consulter le calendrier en lecture seule, tant que vous ne désactivez pas ce lien.',
    ],
  },
  {
    title: 'Hébergement et prestataires',
    paragraphs: [
      'Supabase héberge la base de données, l’authentification et les photos de profil. Cloudflare héberge le site et en assure la sécurité. Google et GitHub n’interviennent que si vous choisissez ces modes de connexion.',
      'Certains de ces prestataires peuvent traiter des données en dehors de l’Union européenne, selon les garanties prévues par leurs propres politiques.',
    ],
  },
  {
    title: 'Cookies et stockage local',
    paragraphs: [
      'Calendraft n’utilise aucun cookie publicitaire ni de suivi. Votre navigateur conserve une session de connexion dans son stockage local pour vous éviter de vous reconnecter à chaque visite. Cloudflare peut déposer des cookies techniques liés à la sécurité du site.',
    ],
  },
  {
    title: 'Durée de conservation',
    paragraphs: [
     'Vos données sont conservées tant que votre compte existe. Vous pouvez supprimer votre compte à tout moment depuis la page « Mon profil » : le compte et son contenu sont alors effacés définitivement, y compris les calendriers que vous avez créés pour les personnes avec qui vous les partagiez. Vous pouvez aussi en faire la demande par email à l’adresse de contact ci-dessus.',
    ],
  },
  {
    title: 'Vos droits',
    paragraphs: [
      `Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, leur portabilité, ou vous opposer à leur traitement, en écrivant à ${CONTACT_EMAIL}. Vous pouvez aussi déposer une réclamation auprès de la CNIL (cnil.fr).`,
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--gradient-main)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(30, 64, 175, 0.25)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ background: 'white', borderRadius: 10, padding: '0.4rem 1rem', display: 'flex', alignItems: 'center' }}>
          <Logo height={32} />
        </div>
        <a
          href="/"
          style={{
            background: 'white', color: 'var(--blue-dark)', borderRadius: 999,
            padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
          }}
        >
          Retour à Calendraft
        </a>
      </header>

      <main style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1.5rem 3rem' }}>
        <div
          style={{
            background: 'white', borderRadius: 16, padding: '2rem',
            boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
          }}
        >
          <h1 style={{ margin: '0 0 0.3rem', fontSize: '1.6rem', color: '#0f172a' }}>
            Politique de confidentialité
          </h1>
          <p style={{ margin: '0 0 1.8rem', fontSize: '0.85rem', color: '#64748b' }}>
            Dernière mise à jour : {LAST_UPDATE}
          </p>

          {SECTIONS.map((s) => (
            <section key={s.title} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: '#0f172a' }}>{s.title}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: '0 0 0.6rem', fontSize: '0.92rem', lineHeight: 1.6, color: '#334155' }}>
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
