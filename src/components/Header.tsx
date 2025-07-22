import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    document.documentElement.setAttribute('dir', newLang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', newLang);
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="app-title">{t('appTitle')}</h1>
        
        <div className="header-controls">
          {/* Language Toggle */}
          <button
            className="control-button language-toggle"
            onClick={toggleLanguage}
            aria-label={t('toggleLanguage')}
            title={t('toggleLanguage')}
          >
            <span className="button-icon">🌐</span>
            <span className="button-text">
              {i18n.language === 'ar' ? 'EN' : 'عر'}
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            className="control-button theme-toggle"
            onClick={toggleTheme}
            aria-label={t('toggleTheme')}
            title={t('toggleTheme')}
          >
            <span className="button-icon">
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
            <span className="button-text">
              {t(theme === 'light' ? 'darkTheme' : 'lightTheme')}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}; 