import { HomeWizardRedirect } from '../../home/HomeWizardRedirect'

/** Legacy route — registration is handled in the Home wizard. */
export default function AuthRegisterPage() {
  return <HomeWizardRedirect authMode="signup" />
}
