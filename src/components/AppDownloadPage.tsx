import type { CSSProperties, ReactNode } from 'react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import { useI18n } from '../hooks/useI18n'
import type { TranslationKey } from '../i18n'

const APK_URL = '/Calendraft.apk'

interface Step {
  title: TranslationKey
  text: TranslationKey
}

const ANDROID_STEPS: Step[] = [
  { title: 'app.android.step1.title', text: 'app.android.step1.text' },
  { title: 'app.android.step2.title', text: 'app.android.step2.text' },
  { title: 'app.android.step3.title', text: 'app.android.step3.text' },
  { title: 'app.android.step4.title', text: 'app.android.step4.text' },
]

const IOS_STEPS: Step[] = [
  { title: 'app.ios.step1.title', text: 'app.ios.step1.text' },
  { title: 'app.ios.step2.title', text: 'app.ios.step2.text' },
  { title: 'app.ios.step3.title', text: 'app.ios.step3.text' },
]

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 16,
  padding: '1.6rem',
  boxShadow: 'var(--shadow-md)',
  marginBottom: '1.2rem',
}

const textStyle: CSSProperties = {
  margin: '0 0 1rem',
  fontSize: '0.92rem',
  lineHeight: 1.6,
  color: 'var(--text-strong)',
}

function StepList({ steps }: { steps: Step[] }) {
  const { t } = useI18n()
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
              background: 'var(--gradient-main)', color: 'var(--on-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
            }}
          >
            {index + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{t(step.title)}</div>
            <div style={{ color: 'var(--text-body)', fontSize: '0.88rem', lineHeight: 1.55, marginTop: 2 }}>
              {t(step.text)}
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
  const { t } = useI18n()
  return (
    <section style={cardStyle}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          flexWrap: 'wrap', marginBottom: '0.8rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>{title}</h2>
        {isYours && (
          <span
            style={{
              background: 'var(--surface-tint)', color: 'var(--accent-text)', border: '1px solid var(--tint-border)',
              borderRadius: 999, padding: '0.15rem 0.7rem', fontSize: '0.75rem', fontWeight: 700,
            }}
          >
            {t('app.yourDevice')}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

export default function AppDownloadPage() {
  const { t } = useI18n()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isAndroid = /Android/i.test(ua)
  const isIOS = /iPhone|iPad|iPod/i.test(ua)

  const android = (
    <Section key="android" title="Android" isYours={isAndroid}>
      <p style={textStyle}>
        {t('app.android.intro')}
      </p>
      <a
        href={APK_URL}
        download="Calendraft.apk"
        style={{
          display: 'inline-block', background: 'var(--gradient-main)', color: 'var(--on-accent)',
          borderRadius: 12, padding: '0.85rem 1.6rem', fontSize: '1rem', fontWeight: 700,
          textDecoration: 'none', boxShadow: 'var(--shadow-accent-md)',
        }}
      >
        {t('app.android.download')}
      </a>
      <p style={{ margin: '0.6rem 0 1.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {t('app.android.fileInfo')}
      </p>
      <StepList steps={ANDROID_STEPS} />
    </Section>
  )

  const ios = (
    <Section key="ios" title={t('app.ios.title')} isYours={isIOS}>
      <p style={textStyle}>
        {t('app.ios.intro')}
      </p>
      <StepList steps={IOS_STEPS} />
    </Section>
  )

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
            {t('common.backToApp')}
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1.5rem 3rem' }}>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: 18, flexShrink: 0, boxShadow: 'var(--shadow-icon)' }}
          />
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h1 style={{ margin: '0 0 0.3rem', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
              {t('app.title')}
            </h1>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-strong)' }}>
              {t('app.intro')}
            </p>
          </div>
        </div>

        {isIOS ? [ios, android] : [android, ios]}

        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.15rem', color: 'var(--text-primary)' }}>{t('app.know.title')}</h2>
          <p style={{ ...textStyle, marginBottom: '0.6rem' }}>
            {t('app.know.text1')}
          </p>
          <p style={{ ...textStyle, marginBottom: 0 }}>
            {t('app.know.text2')}
          </p>
        </section>
      </main>
    </div>
  )
}
