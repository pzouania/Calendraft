import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import { useI18n } from '../hooks/useI18n'
import type { TranslationKey } from '../i18n'

const CONTACT_EMAIL = 'calendraft.help@gmail.com'
const LAST_UPDATE = '2026-10-08'

// Chaque section : clé du titre et clés des paragraphes (textes dans les dictionnaires, section termsPage.*).
const SECTIONS: { title: TranslationKey; paragraphs: TranslationKey[] }[] = [
  { title: 'termsPage.s1.title', paragraphs: ['termsPage.s1.p1'] },
  { title: 'termsPage.s2.title', paragraphs: ['termsPage.s2.p1', 'termsPage.s2.p2'] },
  { title: 'termsPage.s3.title', paragraphs: ['termsPage.s3.p1', 'termsPage.s3.p2'] },
  { title: 'termsPage.s4.title', paragraphs: ['termsPage.s4.p1', 'termsPage.s4.p2'] },
  { title: 'termsPage.s5.title', paragraphs: ['termsPage.s5.p1', 'termsPage.s5.p2'] },
  { title: 'termsPage.s6.title', paragraphs: ['termsPage.s6.p1', 'termsPage.s6.p2'] },
  { title: 'termsPage.s7.title', paragraphs: ['termsPage.s7.p1'] },
  { title: 'termsPage.s8.title', paragraphs: ['termsPage.s8.p1'] },
  { title: 'termsPage.s9.title', paragraphs: ['termsPage.s9.p1'] },
]

export default function TermsPage() {
  const { t, lang, formatDate } = useI18n()
  // Phrase avec un lien au milieu : le texte traduit contient {link}, remplacé ici par le lien.
  const [seeBefore, seeAfter = ''] = t('termsPage.seeAlso', { link: '\u0001' }).split('\u0001')
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
            {t('termsPage.title')}
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

          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {seeBefore}<a href="/confidentialite" style={{ color: 'var(--accent-link)' }}>{t('termsPage.privacyLink')}</a>{seeAfter}
          </p>
        </div>
      </main>
    </div>
  )
}
