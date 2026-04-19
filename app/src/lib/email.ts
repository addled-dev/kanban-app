import nodemailer from 'nodemailer';
import type { ProjectRole } from '@/types';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'addleddev@gmail.com',
    pass: process.env.SMTP_PASSWORD || '',
  },
});

const FROM = process.env.SMTP_FROM || 'Kanban Board <addleddev@gmail.com>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#1e1e1e;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e1e;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#252526;border:1px solid #3e3e42;border-radius:4px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#007acc;padding:18px 32px;">
              <span style="color:#fff;font-size:16px;font-weight:600;letter-spacing:0.02em;">
                &#x2756; Kanban Board
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #3e3e42;color:#858585;font-size:12px;">
              This email was sent from ${APP_URL}. If you did not request this, you can safely ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}"
     style="display:inline-block;margin:20px 0 8px;padding:10px 24px;background:#007acc;
            color:#fff;text-decoration:none;border-radius:2px;font-size:14px;font-weight:500;">
    ${label}
  </a>`;
}

function projectRoleLabel(role: ProjectRole): string {
  if (role === 'READ_WRITE') return 'Read / Write';
  return role.charAt(0) + role.slice(1).toLowerCase();
}

// ── Invite ───────────────────────────────────────────────────────
export async function sendInviteEmail(
  to: string,
  name: string | null,
  token: string,
  options: {
    projectName?: string | null;
    projectRole?: ProjectRole | null;
  } = {}
): Promise<void> {
  const link = `${APP_URL}/invite/${token}`;
  const recipientName = name || to;
  const projectMessage = options.projectName
    ? `<p>You've been invited to join the project <strong>${options.projectName}</strong> with <strong>${projectRoleLabel(options.projectRole || 'READ_WRITE')}</strong> access.</p>`
    : `<p>You've been invited to join <strong>Kanban Board</strong>. Click the button below to set up your account.</p>`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to Kanban Board",
    html: baseTemplate(
      "Invitation to Kanban Board",
      `<p>Hi ${recipientName},</p>
       ${projectMessage}
       ${btn(link, 'Accept Invitation')}
       <p style="color:#858585;font-size:12px;margin-top:16px;">
         Or copy this link: <a href="${link}" style="color:#007acc;">${link}</a><br/>
         This invitation expires in <strong>72 hours</strong>.
       </p>`
    ),
  });
}

// ── Password Reset ───────────────────────────────────────────────
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/reset-password/${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reset your Kanban Board password',
    html: baseTemplate(
      'Password Reset',
      `<p>Hi,</p>
       <p>We received a request to reset the password for your account (<strong>${to}</strong>).</p>
       ${btn(link, 'Reset Password')}
       <p style="color:#858585;font-size:12px;margin-top:16px;">
         Or copy this link: <a href="${link}" style="color:#007acc;">${link}</a><br/>
         This link expires in <strong>1 hour</strong>. If you did not request a reset, ignore this email.
       </p>`
    ),
  });
}

// ── Verify SMTP connection (called at startup in dev) ─────────────
export async function verifySmtp(): Promise<void> {
  try {
    await transporter.verify();
    console.log('✓ SMTP connection verified');
  } catch (err) {
    console.warn('⚠  SMTP verification failed — emails will not send:', (err as Error).message);
  }
}
