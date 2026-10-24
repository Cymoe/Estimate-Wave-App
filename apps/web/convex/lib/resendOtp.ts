import { Email } from "@convex-dev/auth/providers/Email";
import { sendEmail } from "./email";

/**
 * Email sign-up proves the address before the account counts: a 6-digit
 * code goes out through Resend and the person types it back. Until then a
 * staff invite or an approved company waiting on that email is not handed
 * over, so nobody can take either by typing someone else's address.
 */
export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return String(n[0] % 1_000_000).padStart(6, "0");
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const result = await sendEmail([email], {
      subject: `${token} is your FieldQuote code`,
      text: `Your FieldQuote sign-in code is ${token}. It works for 15 minutes.\n\nIf you did not ask for it, ignore this email.`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>Your FieldQuote sign-in code is</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:600;margin:8px 0">${token}</p>
<p style="color:#666">It works for 15 minutes. If you did not ask for it, ignore this email.</p>
</div>`,
    });
    if (result.status !== "sent") {
      throw new Error(result.status === "skipped" ? "Email sign-up needs RESEND_API_KEY on the deployment. Sign in with Google instead." : `The code could not be sent: ${result.error}`);
    }
  },
});
