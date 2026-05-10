import { auth } from '@/lib/auth';
import LandingPage from '@/components/landing-page';

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user?.id;
  
  return <LandingPage isLoggedIn={isLoggedIn} />;
}
