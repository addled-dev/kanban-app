'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check, Loader2, KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { McpApiKey, McpOAuthClient } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  keys: McpApiKey[];
  oauthClients: McpOAuthClient[];
}

export default function ApiKeysClient({ keys: initial, oauthClients: initialOauthClients }: Props) {
  const [keys, setKeys] = useState(initial);
  const [oauthClients, setOauthClients] = useState(initialOauthClients);
  const [name, setName] = useState('');
  const [oauthName, setOauthName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingOauth, setCreatingOauth] = useState(false);
  const [newKey, setNewKey] = useState<{ id: string; name: string; key: string } | null>(null);
  const [newClient, setNewClient] = useState<(McpOAuthClient & { clientSecret: string | null }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedClient, setCopiedClient] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [oauthError, setOauthError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setError('');
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setNewKey(data);
      setKeys(prev => [{ id: data.id, name: data.name, lastUsed: null, createdAt: data.createdAt }, ...prev]);
      setName('');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this API key? Any tools using it will stop working.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' });
      setKeys(prev => prev.filter(k => k.id !== id));
      if (newKey?.id === id) setNewKey(null);
    } finally { setDeletingId(null); }
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyClient = async () => {
    if (!newClient) return;
    const value = [
      `client_id=${newClient.clientId}`,
      newClient.clientSecret ? `client_secret=${newClient.clientSecret}` : null,
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(value);
    setCopiedClient(true);
    setTimeout(() => setCopiedClient(false), 2000);
  };

  const handleCreateOauth = async (e: React.FormEvent) => {
    e.preventDefault();
    const uris = redirectUris.split(/\r?\n/).map(uri => uri.trim()).filter(Boolean);
    if (!oauthName.trim() || uris.length === 0) return;

    setCreatingOauth(true); setOauthError('');
    try {
      const res = await fetch('/api/user/oauth-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: oauthName.trim(), redirectUris: uris, confidential }),
      });
      const data = await res.json();
      if (!res.ok) { setOauthError(data.error); return; }
      setNewClient(data);
      setOauthClients(prev => [data, ...prev]);
      setOauthName('');
      setRedirectUris('');
      setConfidential(false);
    } finally { setCreatingOauth(false); }
  };

  const handleDeleteOauthClient = async (id: string) => {
    if (!confirm('Delete this OAuth client? Issued tokens for it will be revoked.')) return;
    setDeletingClientId(id);
    try {
      await fetch(`/api/user/oauth-clients/${id}`, { method: 'DELETE' });
      setOauthClients(prev => prev.filter(client => client.id !== id));
      if (newClient?.id === id) setNewClient(null);
    } finally { setDeletingClientId(null); }
  };

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--vsc-text)', fontSize: 18, fontWeight: 600, margin: 0 }}>MCP API Keys</h1>
        <p style={{ color: 'var(--vsc-muted)', fontSize: 12, margin: '6px 0 0' }}>
          Use these keys to connect AI tools (Claude Desktop, Claude Code, etc.) to your Kanban board via MCP.
          Keys are scoped to your account — tools can only see your projects and tasks.
        </p>
      </div>

      {/* Connection info box */}
      <div style={{
        background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
        borderLeft: '3px solid var(--vsc-accent)', borderRadius: 4,
        padding: '12px 16px', marginBottom: 24, fontSize: 12,
      }}>
        <div style={{ color: 'var(--vsc-text)', fontWeight: 600, marginBottom: 6 }}>MCP Connection Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--vsc-muted)' }}>
          <div>
            <span style={{ color: 'var(--vsc-text)', fontWeight: 500 }}>SSE Endpoint: </span>
            <code style={{ background: 'var(--vsc-hover)', padding: '1px 6px', borderRadius: 2,
                           fontFamily: 'monospace', fontSize: 11 }}>
              {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/mcp/sse
            </code>
          </div>
          <div>
            <span style={{ color: 'var(--vsc-text)', fontWeight: 500 }}>Auth Header: </span>
            <code style={{ background: 'var(--vsc-hover)', padding: '1px 6px', borderRadius: 2,
                           fontFamily: 'monospace', fontSize: 11 }}>
              X-Api-Key: &lt;your-key&gt;
            </code>
          </div>
          <div>
            <span style={{ color: 'var(--vsc-text)', fontWeight: 500 }}>OAuth Resource Metadata: </span>
            <code style={{ background: 'var(--vsc-hover)', padding: '1px 6px', borderRadius: 2,
                           fontFamily: 'monospace', fontSize: 11 }}>
              {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/.well-known/oauth-protected-resource
            </code>
          </div>
          <div>
            <span style={{ color: 'var(--vsc-text)', fontWeight: 500 }}>OAuth Authorization Server: </span>
            <code style={{ background: 'var(--vsc-hover)', padding: '1px 6px', borderRadius: 2,
                           fontFamily: 'monospace', fontSize: 11 }}>
              {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/.well-known/oauth-authorization-server
            </code>
          </div>
        </div>
      </div>

      {/* New key banner */}
      {newKey && (
        <div style={{
          background: 'rgba(78,201,176,0.08)', border: '1px solid #4ec9b0',
          borderRadius: 4, padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Check size={14} style={{ color: '#4ec9b0' }} />
            <span style={{ color: '#4ec9b0', fontSize: 13, fontWeight: 600 }}>
              Key created — copy it now, it won't be shown again
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: 'var(--vsc-bg)', border: '1px solid var(--vsc-border)',
              padding: '6px 10px', borderRadius: 2, fontSize: 12, fontFamily: 'monospace',
              color: 'var(--vsc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {showKey ? newKey.key : newKey.key.replace(/./g, '•')}
            </code>
            <button className="vsc-btn vsc-btn-ghost" onClick={() => setShowKey(v => !v)}
              style={{ padding: '5px 8px', flexShrink: 0 }} title={showKey ? 'Hide' : 'Show'}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button className="vsc-btn vsc-btn-secondary" onClick={copyKey}
              style={{ flexShrink: 0, minWidth: 80 }}>
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
        </div>
      )}

      {/* New OAuth client banner */}
      {newClient && (
        <div style={{
          background: 'rgba(78,201,176,0.08)', border: '1px solid #4ec9b0',
          borderRadius: 4, padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Check size={14} style={{ color: '#4ec9b0' }} />
            <span style={{ color: '#4ec9b0', fontSize: 13, fontWeight: 600 }}>
              OAuth client created{newClient.clientSecret ? " — copy the secret now, it won't be shown again" : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <code style={{
              background: 'var(--vsc-bg)', border: '1px solid var(--vsc-border)',
              padding: '6px 10px', borderRadius: 2, fontSize: 12, fontFamily: 'monospace',
              color: 'var(--vsc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              client_id: {newClient.clientId}
            </code>
            {newClient.clientSecret && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{
                  flex: 1, background: 'var(--vsc-bg)', border: '1px solid var(--vsc-border)',
                  padding: '6px 10px', borderRadius: 2, fontSize: 12, fontFamily: 'monospace',
                  color: 'var(--vsc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  client_secret: {showClientSecret ? newClient.clientSecret : newClient.clientSecret.replace(/./g, '•')}
                </code>
                <button className="vsc-btn vsc-btn-ghost" onClick={() => setShowClientSecret(v => !v)}
                  style={{ padding: '5px 8px', flexShrink: 0 }} title={showClientSecret ? 'Hide' : 'Show'}>
                  {showClientSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            )}
            <button className="vsc-btn vsc-btn-secondary" onClick={copyClient}
              style={{ alignSelf: 'flex-start', minWidth: 80 }}>
              {copiedClient ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div style={{
        background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
        borderRadius: 4, padding: 20, marginBottom: 24,
      }}>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Create New Key
        </h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
          <input className="vsc-input" value={name} onChange={e => setName(e.target.value)}
            placeholder='Key name, e.g. "Claude Desktop" or "Work Laptop"'
            required style={{ flex: 1 }} />
          <button type="submit" className="vsc-btn vsc-btn-primary" disabled={creating} style={{ flexShrink: 0 }}>
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Generate Key
          </button>
        </form>
        {error && (
          <div style={{ color: '#f44747', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}
      </div>

      {/* Keys list */}
      <div>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Active Keys ({keys.length})
        </h2>
        {keys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--vsc-muted)' }}>
            <KeyRound size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>No API keys yet. Create one above to connect AI tools.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {keys.map(key => (
              <div key={key.id} style={{
                background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                borderRadius: 4, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {key.name}
                  </div>
                  <div style={{ color: 'var(--vsc-muted)', fontSize: 11, marginTop: 2 }}>
                    Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                    {key.lastUsed && (
                      <> · Last used {formatDistanceToNow(new Date(key.lastUsed), { addSuffix: true })}</>
                    )}
                    {!key.lastUsed && <> · Never used</>}
                  </div>
                </div>
                <button className="vsc-btn vsc-btn-ghost" onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  style={{ padding: '4px 6px', color: '#f44747', flexShrink: 0 }} title="Revoke key">
                  {deletingId === key.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OAuth clients */}
      <div style={{
        background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
        borderRadius: 4, padding: 20, margin: '28px 0 24px',
      }}>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          Create OAuth Client
        </h2>
        <form onSubmit={handleCreateOauth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="vsc-input" value={oauthName} onChange={e => setOauthName(e.target.value)}
            placeholder='Client name, e.g. "Claude OAuth" or "Local MCP Inspector"' required />
          <textarea className="vsc-input" value={redirectUris} onChange={e => setRedirectUris(e.target.value)}
            placeholder="Redirect URI, one per line" required rows={3}
            style={{ resize: 'vertical', minHeight: 72 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--vsc-muted)', fontSize: 12 }}>
            <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
            Issue a client secret for confidential clients
          </label>
          <button type="submit" className="vsc-btn vsc-btn-primary" disabled={creatingOauth}
            style={{ alignSelf: 'flex-start' }}>
            {creatingOauth ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create OAuth Client
          </button>
        </form>
        {oauthError && (
          <div style={{ color: '#f44747', fontSize: 12, marginTop: 8 }}>{oauthError}</div>
        )}
      </div>

      <div>
        <h2 style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>
          OAuth Clients ({oauthClients.length})
        </h2>
        {oauthClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--vsc-muted)' }}>
            <ShieldCheck size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>No OAuth clients yet. Create one for MCP tools that support OAuth.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {oauthClients.map(client => (
              <div key={client.id} style={{
                background: 'var(--vsc-sidebar)', border: '1px solid var(--vsc-border)',
                borderRadius: 4, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--vsc-text)', fontSize: 13, fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.name}
                  </div>
                  <div style={{ color: 'var(--vsc-muted)', fontSize: 11, marginTop: 2,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.clientId} · {client.tokenEndpointAuthMethod === 'none' ? 'Public PKCE client' : 'Confidential client'}
                    {' · '}Tokens {client._count.accessTokens}
                    {' · '}Created {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                    {client.lastUsed && <> · Last used {formatDistanceToNow(new Date(client.lastUsed), { addSuffix: true })}</>}
                  </div>
                  <div style={{ color: 'var(--vsc-muted)', fontSize: 11, marginTop: 2,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Redirects: {client.redirectUris.join(', ')}
                  </div>
                </div>
                <button className="vsc-btn vsc-btn-ghost" onClick={() => handleDeleteOauthClient(client.id)}
                  disabled={deletingClientId === client.id}
                  style={{ padding: '4px 6px', color: '#f44747', flexShrink: 0 }} title="Delete OAuth client">
                  {deletingClientId === client.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
