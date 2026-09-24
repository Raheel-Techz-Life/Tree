import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; code?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <LoginForm
      next={sp.next ?? '/trees'}
      inviteCode={sp.code ?? ''}
      initialError={sp.error ?? ''}
    />
  );
}
