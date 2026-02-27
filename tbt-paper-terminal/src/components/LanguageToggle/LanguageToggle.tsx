import { useState } from 'react';
import { useI18n, type LocaleKey } from '../../i18n';
import { Icon } from '../Icon';
import styles from './LanguageToggle.module.css';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);

  const languages: { code: LocaleKey; label: string; nativeLabel: string }[] = [
    { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
    { code: 'en-US', label: 'English', nativeLabel: 'English' },
  ];

  const handleLanguageChange = (newLocale: LocaleKey) => {
    setLocale(newLocale);
    setShowMenu(false);
  };

  const currentLang = languages.find(l => l.code === locale);

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggle}
        onClick={() => setShowMenu(!showMenu)}
        title={t.language?.label}
        aria-label={t.language?.label}
      >
        <Icon name="globe" size="sm" className={styles.icon} />
        <span className={styles.text}>
          {currentLang?.nativeLabel || locale}
        </span>
      </button>

      {showMenu && (
        <div className={styles.menu}>
          {languages.map((lang) => (
            <button
              key={lang.code}
              className={`${styles.menuItem} ${locale === lang.code ? styles.active : ''}`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span className={styles.menuItemLabel}>{lang.nativeLabel}</span>
              <span className={styles.menuItemSubtext}>{lang.label}</span>
              {locale === lang.code && <Icon name="check" size="xs" className={styles.checkIcon} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}





