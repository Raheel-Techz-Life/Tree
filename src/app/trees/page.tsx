import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TreeActions from './TreeActions';
import SignOut from '@/components/SignOut';

export const dynamic = 'force-dynamic';

export default async function TreesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('tree_members')
    .select('role, tree_id, trees(id, name, owner_id, created_at)')
    .order('added_at');

  type Row = { role: string; trees: { id: string; name: string } | null };
  const rows = ((memberships ?? []) as unknown as Row[]).filter((r) => r.trees);

  return (
    <div className="center-page">
      <div className="card wide">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ flex: 1 }}>Your family trees</h1>
          <SignOut />
        </div>
        <p className="sub">Signed in as {user.email}</p>

        {rows.length > 0 ? (
          <div className="tree-list">
            {rows.map((r) => (
              <Link key={r.trees!.id} href={`/t/${r.trees!.id}`}>
                <span style={{ fontWeight: 600 }}>{r.trees!.name}</span>
                <span className="pill">{r.role}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ marginBottom: 18 }}>
            You&apos;re not part of any tree yet. Start one below, or paste an invite code a
            relative sent you.
          </p>
        )}

        <div className="divider" />
        <TreeActions />
      </div>
    </div>
  );
}
