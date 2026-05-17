import { HomeWizardRedirect } from '../../home/HomeWizardRedirect'

/** Legacy route — auth UI lives in Home onboarding wizard only. */
export default function AuthLoginPage() {
  return <HomeWizardRedirect authMode="signin" />
}
