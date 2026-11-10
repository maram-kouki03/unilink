import { Redirect } from 'expo-router';

/** Deep-link target for OAuth / e-mail confirmation. The AuthProvider handles the session. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
