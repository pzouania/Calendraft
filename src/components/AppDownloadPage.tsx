import type { CSSProperties, ReactNode } from 'react'
import Logo from './Logo'

const APK_URL = '/Calendraft.apk'

interface Step {
  title: string
  text: string
}

const ANDROID_STEPS: Step[] = [
  {
    title: 'Téléchargez le fichier',
    text: 'Appuyez sur le bouton ci-dessus. Votre navigateur peut demander de confirmer le téléchargement : acceptez.',
  },
  {
    title: 'Ouvrez le fichier',
    text: 'Ouvrez «\u00A0Calendraft.apk\u00A0» depuis la notification de téléchargement ou depuis l’application Fichiers.',
  },
  {
    title: 'Autorisez l’installation',
    text: 'Android peut demander d’autoriser l’installation depuis cette source (votre navigateur ou Fichiers). Activez l’option pour cette fois.',
  },
  {
    title: 'Passez l’avertissement',
    text: 'Si Play Protect affiche un avertissement, choisissez «\u00A0Installer quand même\u00A0» : l’application n’est pas distribuée par le Play Store.',
  },
]

const IOS_STEPS: Step[] = [
  {
    title: 'Ouvrez calendraft.fr dans Safari',
    text: 'L’ajout à l’écran d’accueil ne fonctionne que depuis Safari.',
  },
  {
    title: 'Appuyez sur Partager',
    text: 'C’est le bouton carré avec une flèche vers le haut, en bas de l’écran (en haut sur iPad).',
  },
  {
    title: 'Choisissez «\u00A0Sur l’écran d’accueil\u00A0»',
    text: 'Faites défiler la liste des actions si besoin, puis appuyez sur Ajouter. L’icône Calendraft apparaît avec vos autres applications.',
  },
]

const cardStyle: CSSProperties = {
  background: 'white',
  borderRadius: 16,
  padding: '1.6rem',
  boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)',
  marginBottom: '1.2rem',
}

const textStyle: CSSProperties = {
  margin: '0 0 1rem',
  fontSize: '0.92rem',
  lineHeight: 1.6,
  color: '#334155',
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol
      style={{
        listStyle: 'none', margin: 0, padding: 0,
        display: 'flex', flexDirection: 'column', gap: '0.9rem',
      }}
    >
      {steps.map((step, index) => (
        <li key={step.title} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
          <span
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--gradient-main)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
            }}
          >
            {index + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>{step.title}</div>
            <div style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.55, marginTop: 2 }}>
              {step.text}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Section({
  title,
  isYours,
  children,
}: {
  title: string
  isYours: boolean
  children: ReactNode
}) {
  return (
    <section style={cardStyle}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          flexWrap: 'wrap', marginBottom: '0.8rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>{title}</h2>
        {isYours && (
          <span
            style={{
              background: '#eff6ff', color: 'var(--blue-dark)', border: '1px solid #bfdbfe',
              borderRadius: 999, padding: '0.15rem 0.7rem', fontSize: '0.75rem', fontWeight: 700,
            }}
          >
            Votre appareil
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

export default function AppDownloadPage() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isAndroid = /Android/i.test(ua)
  const isIOS = /iPhone|iPad|iPod/i.test(ua)

  const android = (
    <Section key="android" title="Android" isYours={isAndroid}>
      <p style={textStyle}>
        Installez le fichier d’application (APK) : Calendraft s’ouvre en plein écran, avec son icône
        sur l’écran d’accueil.
      </p>
      <a
        href={APK_URL}
        download="Calendraft.apk"
        style={{
          display: 'inline-block', background: 'var(--gradient-main)', color: 'white',
          borderRadius: 12, padding: '0.85rem 1.6rem', fontSize: '1rem', fontWeight: 700,
          textDecoration: 'none', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
        }}
      >
        Télécharger pour Android
      </a>
      <p style={{ margin: '0.6rem 0 1.4rem', fontSize: '0.8rem', color: '#64748b' }}>
        Fichier APK, environ 1,5 Mo
      </p>
      <StepList steps={ANDROID_STEPS} />
    </Section>
  )

  const ios = (
    <Section key="ios" title="iPhone et iPad" isYours={isIOS}>
      <p style={textStyle}>
        Apple n’autorise pas l’installation de fichiers d’application en dehors de l’App Store.
        Ajoutez simplement Calendraft à l’écran d’accueil : vous obtenez la même application, en plein
        écran et avec son icône.
      </p>
      <StepList steps={IOS_STEPS} />
    </Section>
  )

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
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: 18, flexShrink: 0, boxShadow: '0 4px 14px rgba(30, 64, 175, 0.2)' }}
          />
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h1 style={{ margin: '0 0 0.3rem', fontSize: '1.6rem', color: '#0f172a' }}>
              Calendraft sur votre téléphone
            </h1>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: '#334155' }}>
              Retrouvez vos calendriers comme dans une vraie application, gratuite, depuis l’écran
              d’accueil de votre téléphone.
            </p>
          </div>
        </div>

        {isIOS ? [ios, android] : [android, ios]}

        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.15rem', color: '#0f172a' }}>À savoir</h2>
          <p style={{ ...textStyle, marginBottom: '0.6rem' }}>
            L’application affiche calendraft.fr : vos calendriers sont toujours à jour, sans
            réinstaller. Une connexion internet est nécessaire.
          </p>
          <p style={{ ...textStyle, marginBottom: 0 }}>
            Sur ordinateur, Chrome et Edge proposent aussi «&nbsp;Installer Calendraft&nbsp;» dans la barre
            d’adresse.
          </p>
        </section>
      </main>
    </div>
  )
}
