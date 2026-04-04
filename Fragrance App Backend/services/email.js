const nodemailer = require("nodemailer");

function shouldExposeDebugCode() {
  return process.env.NODE_ENV === "test" || process.env.AUTH_DEBUG_CODES === "true";
}

function getTransport() {
  if (!process.env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || ""
      }
      : undefined
  });
}

async function sendAuthCodeEmail({ email, code, purpose }) {
  const safeEmail = String(email || "").trim();
  const safeCode = String(code || "").trim();
  const verificationMode = purpose === "reset_password" ? "password reset" : "email verification";
  const subject = purpose === "reset_password"
    ? "Reset your Maison d'Aura password"
    : "Verify your Maison d'Aura account";
  const text = [
    `Your Maison d'Aura ${verificationMode} code is ${safeCode}.`,
    "It expires in 10 minutes.",
    "If you did not request this code, you can ignore this email."
  ].join(" ");
  const fromAddress = process.env.SMTP_FROM_EMAIL || "no-reply@maison-daura.local";
  const transport = getTransport();

  if (transport) {
    await transport.sendMail({
      from: fromAddress,
      to: safeEmail,
      subject,
      text
    });

    return { deliveryMode: "smtp" };
  }

  console.info(`[auth-email:${purpose}] ${safeEmail} code=${safeCode}`);

  return shouldExposeDebugCode()
    ? { deliveryMode: "debug", debugCode: safeCode }
    : { deliveryMode: "console" };
}

module.exports = {
  sendAuthCodeEmail
};
