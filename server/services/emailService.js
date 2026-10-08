let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    nodemailer = null;
}

async function sendPasswordResetEmail(email, rawToken) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;

    const smtpHost = process.env.SMTP_HOST;

    if (smtpHost && nodemailer) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            await transporter.sendMail({
                from: process.env.MAIL_FROM || 'noreply@tn.gov.in',
                to: email,
                subject: 'TN Schemes Finder - Password Reset Request',
                text: `You requested a password reset. Click or copy the following link to reset your password (valid for 30 minutes):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
                html: `<p>You requested a password reset for TN Schemes & Pensions Finder.</p><p><a href="${resetUrl}">Click here to reset your password</a> (valid for 30 minutes).</p>`
            });
            console.log(`[EmailService] Password reset email sent to ${email}`);
        } catch (err) {
            console.error(`[EmailService] Failed to send email via SMTP:`, err.message);
        }
    } else {
        // SMTP not configured or nodemailer missing - log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
        }
    }
}

module.exports = {
    sendPasswordResetEmail
};
