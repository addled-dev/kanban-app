import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kanban.local').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: await hash(adminPassword, 12),
        name: adminName,
        role: 'ADMIN',
        emailVerified: true,
      },
    });
    console.log(`✓ Admin account created: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  ⚠  Change this password after first login!`);
  } else {
    console.log(`✓ Admin already exists: ${adminEmail}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
