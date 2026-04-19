'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Code2, Sun, Moon, LogOut, LayoutDashboard, ChevronLeft, KeyRound, UserPlus, Users } from 'lucide-react';
import type { ProjectRole } from '@/types';

interface Props {
  children: React.ReactNode;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  projectRole?: ProjectRole;
}

export default function AppShell({ children, projectId, projectName, projectColor, projectRole }: Props) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isAdmin = (session?.user as any)?.role === 'ADMIN';

  const navLink = (href: string, icon: React.ReactNode, label: string) => {
    const active = pathname === href;
    return (
      <Link href={href} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
        fontSize: 13, textDecoration: 'none',
        color: active ? 'var(--vsc-text)' : 'var(--vsc-muted)',
        background: active ? 'var(--vsc-hover)' : 'transparent',
      }}>
        {icon}{label}
      </Link>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Activity Bar */}
      <div style={{
        width: 48, background: 'var(--vsc-activitybar)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 0', gap: 8, flexShrink: 0, zIndex: 30,
      }}>
        <Code2 size={22} style={{ color: '#007acc', marginBottom: 8 }} />
        <div style={{ flex: 1 }} />
        {mounted && (
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cccccc',
                     padding: 8, borderRadius: 4, display: 'flex' }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
        <button onClick={() => signOut({ callbackUrl: '/login' })} title="Sign out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cccccc',
                   padding: 8, borderRadius: 4, display: 'flex' }}>
          <LogOut size={18} />
        </button>
      </div>

      {/* Sidebar */}
      <div style={{
        width: 220, background: 'var(--vsc-sidebar)',
        borderRight: '1px solid var(--vsc-border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--vsc-border)' }}>
          <span style={{ color: 'var(--vsc-muted)', fontSize: 11, fontWeight: 600,
                         textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Explorer
          </span>
        </div>

        {/* User info */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--vsc-border)' }}>
          <div style={{ color: 'var(--vsc-text)', fontSize: 12, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session?.user?.name || session?.user?.email}
          </div>
          {session?.user?.name && (
            <div style={{ color: 'var(--vsc-muted)', fontSize: 11, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              {session?.user?.email}
            </div>
          )}
          {isAdmin && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, marginTop: 4,
                           background: 'rgba(0,122,204,0.15)', color: '#007acc',
                           display: 'inline-block', fontWeight: 600 }}>
              ADMIN
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: '6px 0', flex: 1, overflowY: 'auto' }}>
          {navLink('/dashboard', <LayoutDashboard size={14} />, 'Dashboard')}

          {/* Current project indicator */}
          {projectId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
              fontSize: 13, color: 'var(--vsc-text)', background: 'var(--vsc-hover)',
              marginTop: 4, borderLeft: `3px solid ${projectColor || '#007ACC'}`,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%',
                             background: projectColor || '#007ACC', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {projectName}
              </span>
            </div>
          )}

          {projectId && projectRole === 'ADMIN' && (
            navLink(`/projects/${projectId}/members`, <Users size={14} />, 'Project Users')
          )}

          {/* Settings section */}
          <div style={{ padding: '12px 14px 4px', color: 'var(--vsc-muted)', fontSize: 10,
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Settings
          </div>
          {navLink('/settings/api-keys', <KeyRound size={14} />, 'MCP API Keys')}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div style={{ padding: '12px 14px 4px', color: 'var(--vsc-muted)', fontSize: 10,
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Admin
              </div>
              {navLink('/admin/invite', <UserPlus size={14} />, 'Invite Users')}
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '6px 14px', borderTop: '1px solid var(--vsc-border)',
                      fontSize: 11, color: 'var(--vsc-muted)' }}>
          Kanban Board v2.0
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Breadcrumb bar */}
        <div style={{
          height: 35, background: 'var(--vsc-sidebar)',
          borderBottom: '1px solid var(--vsc-border)',
          display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, flexShrink: 0,
        }}>
          {projectId ? (
            <>
              <button onClick={() => router.push('/dashboard')}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         color: 'var(--vsc-muted)', padding: '2px 4px', display: 'flex',
                         alignItems: 'center', borderRadius: 2 }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>Projects</span>
              <span style={{ color: 'var(--vsc-muted)', fontSize: 12 }}>/</span>
              <span style={{ color: 'var(--vsc-text)', fontSize: 12, display: 'flex',
                             alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%',
                               background: projectColor || '#007ACC', display: 'inline-block' }} />
                {projectName}
              </span>
              {projectRole && (
                <span style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 10,
                  background: 'var(--vsc-hover)',
                  color: 'var(--vsc-muted)',
                  fontWeight: 600,
                }}>
                  {projectRole === 'READ_WRITE' ? 'READ / WRITE' : projectRole}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--vsc-text)', fontSize: 12 }}>
              {pathname === '/settings/api-keys' ? 'Settings / MCP API Keys'
                : pathname === '/admin/invite' ? 'Admin / Invite Users'
                : 'Dashboard'}
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  );
}
