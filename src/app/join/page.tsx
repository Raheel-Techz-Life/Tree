import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JoinClient from './JoinClient';

export const dynamic = 'force-dynamic';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = '' } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?code=${encodeURIComponent(code)}`);
  return <JoinClient code={code} />;
}
