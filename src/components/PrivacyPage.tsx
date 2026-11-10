import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import { useI18n } from '../hooks/useI18n'
import type { TranslationKey } from '../i18n'

const CONTACT_EMAIL = 'calendraft.help@gmail.com'
const LAST_UPDATE = '2026-11-10'

// Chaque section : clé du titre et clés des paragraphes (textes dans les dictionnaires, section privacyPage.*).
const SECTIONS: { title: TranslationKey; paragraphs: TranslationKey[] }[] = [
  { title: 'privacyPage.s1.title', paragraphs: ['privacyPage.s1.p1'] },
  { title: 'privacyPage.s2.title', paragraphs: ['privacyPage.s2.p1', 'privacyPage.s2.p2', 'privacyPage.s2.p3', 'privacyPage.s2.p4', 'privacyPage.s2.p5', 'privacyPage.s2.p6', 'privacyPage.s2.p7'] },
  { title: 'privacyPage.s3.title', paragraphs: ['privacyPage.s3.p1'] },
  { title: 'privacyPage.s4.title', paragraphs: ['privacyPage.s4.p1'] },
  { title: 'privacyPage.s5.title', paragraphs: ['privacyPage.s5.p1', 'privacyPage.s5.p2', 'privacyPage.s5.p3'] },
  { title: 'privacyPage.s6.title', paragraphs: ['privacyPage.s6.p1'] },
  { title: 'privacyPage.s7.title', paragraphs: ['privacyPage.s7.p1'] },
  { title: 'privacyPage.s8.title', paragraphs: ['privacyPage.s8.p1'] },
]

export default function PrivacyPage() {
  const { t, lang, formatDate } = useI18n()
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
        <div
          style={{
            background: 'var(--surface)', borderRadius: 16, padding: '2rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <h1 style={{ margin: '0 0 0.3rem', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
            {t('privacyPage.title')}
          </h1>
          <p style={{ margin: '0 0 1.8rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('legal.lastUpdate', { date: formatDate(LAST_UPDATE, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
          {lang !== 'fr' && (
            <p style={{ margin: '-1rem 0 1.8rem', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              {t('legal.frenchPrevails')}
            </p>
          )}

          {SECTIONS.map((s) => (
            <section key={s.title} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{t(s.title)}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: '0 0 0.6rem', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-strong)' }}>
                  {t(p, { email: CONTACT_EMAIL })}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
