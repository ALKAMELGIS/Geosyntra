import { Link } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import './AiAgroCloud.css'

export default function AiAgroCloud() {
  const { language } = useLanguage()
  const ar = language === 'ar'

  return (
    <div className="page aac-root">
      <section className="aac-hero" aria-labelledby="aac-main-title">
        <div className="aac-hero-inner">
          <h1 id="aac-main-title" className="aac-title">
            <span className="aac-title-icon" aria-hidden>
              <i className="fa-solid fa-cloud-bolt" />
            </span>
            {ar ? 'سحابة Agro الذكية' : 'AI AgroCloud'}
          </h1>
          <p className="aac-lead">
            {ar
              ? 'مركز موجّه للزراعة المسندة بالذكاء الاصطناعي ومبنية على طبقات خريطة GIS (محفوظة في هذا المتصفح).'
              : 'A focused hub for AI-assisted agronomy grounded in your GIS Map layers (saved in this browser).'}
          </p>

          <div className="aac-grid">
            <Link className="aac-card" to="/dashboards/ai-agro-chat">
              <div className="aac-card-head">
                <div className="aac-card-icon" aria-hidden>
                  <i className="fa-solid fa-comments" />
                </div>
                <div>
                  <h2 className="aac-card-title">{ar ? 'محادثة Agro الذكية' : 'AI Agro-Chat'}</h2>
                  <p className="aac-card-desc">
                    {ar
                      ? 'اسأل عن الحقول والطبقات والجداول بناءً على محتوى GIS فقط، مع تفسير واضح ومختصر.'
                      : 'Ask about fields, layers, and tables using GIS Content only—clear, concise answers.'}
                  </p>
                </div>
              </div>
              <span className="aac-card-cta">
                {ar ? 'فتح المحادثة' : 'Open chat'} <i className="fa-solid fa-arrow-right" aria-hidden />
              </span>
            </Link>
          </div>

          <p className="aac-foot">
            {ar
              ? 'المفاتيح من إعدادات النظام → رموز API (Gemini / DeepSeek).'
              : 'Configure keys under System Settings → API Tokens (Gemini / DeepSeek).'}
          </p>
        </div>
      </section>
    </div>
  )
}
