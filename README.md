# Kanban Board v2

A full-featured, invite-only Kanban board with VS Code-themed UI, email flows, user-scoped MCP integration, and a single Docker Compose stack.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, @hello-pangea/dnd |
| Auth | NextAuth.js v4 — email/password, JWT sessions |
| Database | PostgreSQL 16 + Prisma ORM |
| Email | Nodemailer → Gmail SMTP (App Password) |
| MCP | `@modelcontextprotocol/sdk` — SSE transport, built into Next.js API routes |
| Deployment | Docker Compose (2 services: app + postgres) |

---

## Quick Start

### 1 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Email for the default admin account |
| `ADMIN_PASSWORD` | Password for the default admin (change after first login!) |
| `SMTP_PASSWORD` | **Google App Password** — see below |
| `APP_URL` | Public URL of your deployment (e.g. `https://kanban.example.com`) |

### 2 — Set up Gmail SMTP (App Password)

Regular Gmail passwords won't work. You need a Google App Password:

1. Go to your Google Account → **Security**
2. Enable **2-Step Verification** if not already on
3. Go to **Security → App passwords**
4. Select app: **Mail**, device: **Other** → name it "Kanban Board"
5. Copy the 16-character password into `SMTP_PASSWORD` in `.env`

### 3 — Start

```bash
docker compose up -d
```

- App: **http://localhost:3000**
- The admin account is created automatically on first boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`

---

## How it works

### Invite-only registration

There is no open registration page. To add a user:

1. Sign in as admin
2. Go to **Admin → Invite Users** in the sidebar
3. Enter name + email → click **Send Invitation**
4. The invitee receives an email with a link that expires in **72 hours**
5. They click the link, set a password, and their account is created

### Password reset

1. User clicks **Forgot password?** on the login page
2. They enter their email
3. If an account exists, a reset link (valid **1 hour**) is emailed
4. They click the link and set a new password

### MCP API Keys

Each user can create named API keys scoped to their own account:

1. Go to **Settings → MCP API Keys** in the sidebar
2. Enter a name (e.g. "Claude Desktop") → click **Generate Key**
3. Copy the key immediately — it is shown only once
4. Connect any MCP client using:

```
SSE Endpoint : http://localhost:3000/api/mcp/sse
Auth Header  : X-Api-Key: kb_<your-key>
```

The MCP server enforces user-level scoping — tools can only access the authenticated user's own projects and tasks.

### MCP Tools

| Tool | Description |
|---|---|
| `list_projects` | List all your projects |
| `create_project` | Create a new project |
| `list_tasks` | List tasks in a project (optional status filter) |
| `create_task` | Create a task with full field support |
| `move_task` | Move a task to a different column |
| `delete_task` | Permanently delete a task |

### Example MCP config (Claude Desktop `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "kanban": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp/sse"],
      "env": {
        "MCP_REMOTE_HEADER_X_API_KEY": "kb_your_key_here"
      }
    }
  }
}
```

---

## Development

```bash
cd app
cp ../.env.example .env.local   # fill in values
npm install
npx prisma migrate dev
npx prisma db seed              # creates admin account
npm run dev
```

App runs on http://localhost:3000.

---

## Project structure

```
kanban-board/
├── docker-compose.yml
├── .env.example
├── README.md
└── app/
    ├── Dockerfile
    ├── entrypoint.sh           # migrate → seed → start
    ├── prisma/
    │   ├── schema.prisma       # User, Project, Task, Attachment,
    │   │                       # InviteToken, PasswordResetToken, McpApiKey
    │   ├── seed.ts             # Creates default admin on first boot
    │   └── migrations/
    └── src/
        ├── app/
        │   ├── login/          # Sign-in page (no open registration)
        │   ├── forgot-password/
        │   ├── reset-password/[token]/
        │   ├── invite/[token]/ # Invite acceptance + account creation
        │   ├── dashboard/      # Project grid
        │   ├── projects/[id]/  # Kanban board
        │   ├── settings/
        │   │   └── api-keys/   # MCP key management
        │   ├── admin/
        │   │   └── invite/     # Send invitations (admin only)
        │   └── api/
        │       ├── auth/       # NextAuth, invite, forgot/reset password
        │       ├── mcp/        # SSE + messages (unified, user-scoped)
        │       ├── projects/
        │       ├── tasks/
        │       ├── upload/
        │       ├── files/
        │       └── user/api-keys/
        ├── components/
        │   ├── AppShell        # VS Code sidebar + activity bar
        │   ├── KanbanBoard     # DnD board
        │   ├── TaskCard        # Pastel post-it card
        │   ├── TaskModal       # Create/edit/delete + attachments
        │   ├── DashboardClient # Project grid
        │   ├── ApiKeysClient   # MCP key management UI
        │   └── InviteClient    # Invite management UI (admin)
        └── lib/
            ├── auth.ts         # NextAuth config
            ├── prisma.ts       # Singleton client
            ├── email.ts        # Nodemailer + HTML templates
            ├── tokens.ts       # Token/key generation + hashing
            ├── mcp-server.ts   # User-scoped MCP tool definitions
            └── mcp-sessions.ts # SSE session store + transport adapter
```
