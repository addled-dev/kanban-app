import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AppShell from '@/components/AppShell';
import ApiKeysClient from '@/components/ApiKeysClient';

export default async function ApiKeysPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const keys = await prisma.mcpApiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, lastUsed: true, createdAt: true },
  });

  return (
    <AppShell>
      <ApiKeysClient keys={JSON.parse(JSON.stringify(keys))} />
    </AppShell>
  );
}
