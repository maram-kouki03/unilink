import { Redirect } from 'expo-router';

/** Old deep-link target (unilink://auth-callback). Kept so old links still open the app. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
