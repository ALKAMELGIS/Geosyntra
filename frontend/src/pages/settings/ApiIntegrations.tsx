import { motion } from 'framer-motion'
import { useLanguage } from '../../lib/i18n'
import './apiIntegrations.css'

export default function ApiIntegrations() {
  const { language } = useLanguage()
  const ar = language === 'ar'

  const copy = ar
    ? {
        title: 'مدير API',
        subtitle: 'إدارة التكاملات والمفاتيح السرية بأمان',
      }
    : {
        title: 'API Manager',
        subtitle: 'Manage all integrations & secrets securely',
      }

  return (
    <motion.div
      className="api-manager-page api-manager-page--empty"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <header className="api-manager-page__header">
        <motion.div className="api-manager-page__brand">
          <span className="api-manager-page__icon" aria-hidden>
            <i className="fa-solid fa-plug" />
          </span>
          <div className="api-manager-page__titles">
            <h1 className="api-manager-page__title">{copy.title}</h1>
            <p className="api-manager-page__subtitle">{copy.subtitle}</p>
          </div>
        </motion.div>
      </header>

      <div className="api-manager-page__body" aria-hidden="true" />
    </motion.div>
  )
}
