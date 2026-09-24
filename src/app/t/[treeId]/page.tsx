import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Workspace from '@/components/Workspace';
import type { Person, Union, ParentChild, Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TreePage({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/t/${treeId}`);

  const { data: tree } = await supabase
    .from('trees').select('id, name, owner_id').eq('id', treeId).maybeSingle();
  if (!tree) notFound();

  const { data: membership } = await supabase
    .from('tree_members').select('role').eq('tree_id', treeId).eq('user_id', user.id).maybeSingle();
  if (!membership) notFound();

  const [persons, unions, edges] = await Promise.all([
    supabase.from('persons').select('*').eq('tree_id', treeId),
    supabase.from('unions').select('*').eq('tree_id', treeId),
    supabase.from('parent_child').select('*').eq('tree_id', treeId),
  ]);

  return (
    <Workspace
      treeId={treeId}
      treeName={tree.name}
      isOwner={tree.owner_id === user.id}
      role={membership.role as Role}
      userId={user.id}
      initial={{
        persons: (persons.data ?? []) as Person[],
        unions: (unions.data ?? []) as Union[],
        edges: (edges.data ?? []) as ParentChild[],
      }}
    />
  );
}
