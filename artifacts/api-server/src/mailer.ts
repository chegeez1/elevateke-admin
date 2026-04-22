import { Resend } from "resend";
import { logger } from "./lib/logger";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "ElevateKe <noreply@elevateke.com>";
const SITE_URL = process.env.SITE_URL ?? "https://elevateke.com";

function baseTemplate(content: string, previewText = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>ElevateKe</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f7f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>` : ""}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f7f6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${SITE_URL}" style="text-decoration:none;">
                <span style="font-size:26px;font-weight:800;color:#16a34a;letter-spacing:-0.5px;">↗ ElevateKe</span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:32px;padding-bottom:8px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
                © ${new Date().getFullYear()} ElevateKe. All rights reserved.
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                You received this email because you have an account with ElevateKe.
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                <a href="${SITE_URL}/profile" style="color:#16a34a;text-decoration:none;">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="${SITE_URL}" style="color:#16a34a;text-decoration:none;">Visit ElevateKe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function heroSection(title: string, subtitle: string, accentColor = "#16a34a"): string {
  return `
    <div style="background:linear-gradient(135deg,${accentColor} 0%,#065f46 100%);padding:40px 40px 32px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">${title}</h1>
      <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);line-height:1.5;">${subtitle}</p>
    </div>`;
}

function bodySection(html: string): string {
  return `<div style="padding:32px 40px;">${html}</div>`;
}

function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 0;">
      <tr>
        <td style="border-radius:8px;background-color:#16a34a;">
          <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;
}

function bulletList(items: string[]): string {
  return `<ul style="margin:16px 0;padding-left:20px;">
    ${items.map((item) => `<li style="margin-bottom:8px;font-size:15px;color:#374151;line-height:1.6;">${item}</li>`).join("")}
  </ul>`;
}

function highlight(label: string, value: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:12px;">
      <tr>
        <td style="background-color:#f0fdf4;border-radius:8px;padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">${label}</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">${value}</p>
        </td>
      </tr>
    </table>`;
}

async function send({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn({ to }, "[mailer] RESEND_API_KEY not set — email skipped");
    return;
  }

  const { error } = await resend.emails.send({ from: FROM, to: [to], subject, html, text });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const subject = "Welcome to ElevateKe — start earning today";
  const html = baseTemplate(
    heroSection("Welcome to ElevateKe! 🎉", "Your investment journey starts now") +
      bodySection(`
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
          You've successfully created your ElevateKe account. We're excited to have you join thousands of Kenyans who are growing their wealth every day.
        </p>
        ${bulletList([
          "<strong>Make your first M-Pesa deposit</strong> — choose a plan that matches your goals",
          "<strong>Earn daily returns</strong> of up to 5% automatically credited to your balance",
          "<strong>Invite friends</strong> and earn referral bonuses on every level",
          "<strong>Climb VIP tiers</strong> to unlock higher daily earning rates",
        ])}
        ${ctaButton("Make Your First Deposit →", `${SITE_URL}/deposit`)}
        ${divider()}
        <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
          Questions? Reply to this email or visit your inbox inside the app.
        </p>
      `),
    `Welcome to ElevateKe, ${name}! Make your first deposit to start earning daily returns.`,
  );

  const text = `Welcome to ElevateKe, ${name}!\n\nYour account is ready. Make your first M-Pesa deposit to start earning daily returns.\n\nVisit: ${SITE_URL}/deposit\n\n— The ElevateKe Team`;
  await send({ to, subject, html, text });
}

export async function sendDepositConfirmationEmail(params: {
  to: string;
  name: string;
  message: string;
  amount?: number;
  planName?: string;
}): Promise<void> {
  const { to, name, message, amount, planName } = params;
  const subject = "Deposit Confirmed — ElevateKe";
  const html = baseTemplate(
    heroSection("Deposit Confirmed ✅", "Your funds are now active and earning") +
      bodySection(`
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>
        ${amount ? highlight("Amount Deposited", `KSH ${amount.toLocaleString()}`) : ""}
        ${planName ? highlight("Investment Plan", planName) : ""}
        <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.7;">${message}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
          Your daily earnings will start accumulating automatically. Come back each day to claim them!
        </p>
        ${ctaButton("View My Dashboard →", `${SITE_URL}/dashboard`)}
        ${divider()}
        <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
          This confirmation is for your records. If you did not make this deposit, please contact us immediately.
        </p>
      `),
    `Your deposit of${amount ? ` KSH ${amount.toLocaleString()}` : ""} has been confirmed!`,
  );

  const text = `Hi ${name},\n\nYour deposit has been confirmed!\n\n${message}\n\nVisit your dashboard: ${SITE_URL}/dashboard\n\n— The ElevateKe Team`;
  await send({ to, subject, html, text });
}

export async function sendDepositFailedEmail(to: string, name: string): Promise<void> {
  const subject = "Payment unsuccessful — ElevateKe";
  const html = baseTemplate(
    heroSection("Payment Unsuccessful", "Your M-Pesa payment could not be processed", "#dc2626") +
      bodySection(`
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
          We were unable to process your recent M-Pesa payment. This can happen if:
        </p>
        ${bulletList([
          "You cancelled the M-Pesa STK Push prompt",
          "Insufficient funds in your M-Pesa account",
          "The payment request timed out",
          "A temporary network issue occurred",
        ])}
        <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.7;">
          No funds have been deducted from your account. You can try again at any time.
        </p>
        ${ctaButton("Try Again →", `${SITE_URL}/deposit`)}
        ${divider()}
        <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
          If you believe this is an error and funds were deducted, please contact our support team immediately.
        </p>
      `),
    "Your recent M-Pesa payment was unsuccessful. No funds were deducted.",
  );

  const text = `Hi ${name},\n\nYour recent M-Pesa payment could not be processed. No funds were deducted.\n\nPlease try again: ${SITE_URL}/deposit\n\n— The ElevateKe Team`;
  await send({ to, subject, html, text });
}

export async function sendWithdrawalApprovedEmail(
  to: string,
  name: string,
  amount: number,
): Promise<void> {
  const subject = "Withdrawal Approved — ElevateKe";
  const html = baseTemplate(
    heroSection("Withdrawal Approved ✅", "Your funds are on their way") +
      bodySection(`
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>
        ${highlight("Withdrawal Amount", `KSH ${amount.toLocaleString()}`)}
        <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.7;">
          Great news! Your withdrawal request has been approved. Funds will be sent to your registered M-Pesa number shortly.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
          M-Pesa transfers typically arrive within a few minutes. If you don't receive it within 24 hours, please contact our support team.
        </p>
        ${ctaButton("View Transaction History →", `${SITE_URL}/transactions`)}
      `),
    `Your withdrawal of KSH ${amount.toLocaleString()} has been approved!`,
  );

  const text = `Hi ${name},\n\nYour withdrawal of KSH ${amount.toLocaleString()} has been approved and will be sent to your M-Pesa shortly.\n\n— The ElevateKe Team`;
  await send({ to, subject, html, text });
}

export async function sendWithdrawalRejectedEmail(
  to: string,
  name: string,
  amount: number,
  reason?: string,
): Promise<void> {
  const subject = "Withdrawal Update — ElevateKe";
  const html = baseTemplate(
    heroSection("Withdrawal Not Processed", "Your balance has been restored", "#d97706") +
      bodySection(`
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>
        ${highlight("Requested Amount", `KSH ${amount.toLocaleString()}`)}
        <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.7;">
          Unfortunately, your withdrawal request could not be processed at this time.${reason ? ` Reason: <strong>${reason}</strong>.` : ""}
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
          Your balance has been fully restored to your account. You're welcome to submit a new request after reviewing your account status.
        </p>
        ${ctaButton("View My Account →", `${SITE_URL}/profile`)}
        ${divider()}
        <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
          If you believe this is a mistake, please contact our support team with your transaction reference.
        </p>
      `),
    `Your withdrawal of KSH ${amount.toLocaleString()} was not processed. Your balance has been restored.`,
  );

  const text = `Hi ${name},\n\nYour withdrawal of KSH ${amount.toLocaleString()} could not be processed${reason ? ` (${reason})` : ""}. Your balance has been restored.\n\nContact support if you need assistance.\n\n— The ElevateKe Team`;
  await send({ to, subject, html, text });
}

export async function sendDepositReminderEmail(
  to: string,
  reminderNumber: 1 | 2,
): Promise<void> {
  if (reminderNumber === 1) {
    const subject = "Your ElevateKe account is ready — start earning today";
    const html = baseTemplate(
      heroSection("Your Account Is Ready!", "One small step to start earning daily returns") +
        bodySection(`
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi there,</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
            You joined ElevateKe yesterday but haven't made your first deposit yet. Your account is set up and ready — all it needs is funding.
          </p>
          ${bulletList([
            "Earn <strong>daily returns</strong> automatically credited every 24 hours",
            "Get started with as little as <strong>KSH 500</strong> via M-Pesa",
            "Compound your returns by reinvesting — watch your balance grow",
            "Refer friends to earn extra on top of your daily returns",
          ])}
          ${ctaButton("Make My First Deposit →", `${SITE_URL}/deposit`)}
          ${divider()}
          <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
            Getting started takes less than 2 minutes via M-Pesa STK Push.
          </p>
        `),
      "Your ElevateKe account is ready. Make your first deposit to start earning today!",
    );
    const text = `Hi,\n\nYou joined ElevateKe but haven't made your first deposit yet. Start earning daily returns with just KSH 500 via M-Pesa.\n\nDeposit now: ${SITE_URL}/deposit\n\n— The ElevateKe Team`;
    await send({ to, subject, html, text });
  } else {
    const subject = "Don't miss out — your ElevateKe earnings clock is ticking";
    const html = baseTemplate(
      heroSection("Every Day Counts", "Others are earning — you can too") +
        bodySection(`
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi there,</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
            It's been 3 days since you joined ElevateKe, and your account is still waiting to be activated. Every day without a deposit is a missed opportunity to grow your money.
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
            Here's what you're missing right now:
          </p>
          ${bulletList([
            "Daily returns deposited automatically to your balance",
            "A growing VIP level that unlocks <strong>higher earning rates</strong>",
            "Compounding effect — the sooner you start, the more you earn",
            "Referral bonuses every time someone you invited invests",
          ])}
          <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.7;">
            Your future self will thank you for starting today.
          </p>
          ${ctaButton("Activate My Account Now →", `${SITE_URL}/deposit`)}
          ${divider()}
          <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
            M-Pesa STK Push · Takes less than 2 minutes · No hidden fees
          </p>
        `),
      "3 days in and you're still not earning. One M-Pesa deposit changes that.",
    );
    const text = `Hi,\n\nIt's been 3 days since you joined ElevateKe and your account hasn't been activated yet. Start now and earn daily returns.\n\nDeposit now: ${SITE_URL}/deposit\n\n— The ElevateKe Team`;
    await send({ to, subject, html, text });
  }
}
