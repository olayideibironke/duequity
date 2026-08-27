import "server-only";

import nodemailer from "nodemailer";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const DUEQUITY_CONTACT_EMAIL =
  "info@duequity.com";

export const DUEQUITY_CONTACT_PHONE =
  "1-888-669-2551";

const DEFAULT_SMTP_HOST =
  "smtp.purelymail.com";

const DEFAULT_SMTP_PORT =
  465;

/* ========================================================================== */
/* Configuration                                                               */
/* ========================================================================== */

function environmentValue(
  key: string,
): string | undefined {
  const value =
    process.env[key]?.trim();

  return value ||
    undefined;
}

function smtpUsername(): string {
  const value =
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_USERNAME",
    )?.toLowerCase();

  if (!value) {
    throw new Error(
      "DueQuity contact SMTP username is not configured.",
    );
  }

  if (
    value !==
    DUEQUITY_CONTACT_EMAIL
  ) {
    throw new Error(
      `DUEQUITY_CONTACT_SMTP_USERNAME must be ${DUEQUITY_CONTACT_EMAIL}.`,
    );
  }

  return value;
}

function smtpPassword(): string {
  const value =
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_PASSWORD",
    );

  if (!value) {
    throw new Error(
      "DueQuity contact SMTP password is not configured.",
    );
  }

  return value;
}

function smtpHost(): string {
  return (
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_HOST",
    ) ??
    DEFAULT_SMTP_HOST
  );
}

function smtpPort(): number {
  const raw =
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_PORT",
    );

  if (!raw) {
    return DEFAULT_SMTP_PORT;
  }

  const parsed =
    Number.parseInt(
      raw,
      10,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 1 ||
    parsed > 65_535
  ) {
    throw new Error(
      "DueQuity contact SMTP port is invalid.",
    );
  }

  return parsed;
}

export function contactEmailTransportConfigured(): boolean {
  return Boolean(
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_USERNAME",
    ) &&
    environmentValue(
      "DUEQUITY_CONTACT_SMTP_PASSWORD",
    ),
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function validEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function headerSafe(
  value: string,
): string {
  return value
    .replace(
      /[\r\n]+/g,
      " ",
    )
    .trim();
}

/* ========================================================================== */
/* Send                                                                        */
/* ========================================================================== */

export async function sendDueQuityContactEmail(input: {
  to: string;

  subject: string;

  bodyText: string;
}): Promise<{
  messageId?: string;
}> {
  const to =
    input.to
      .trim()
      .toLowerCase();

  if (
    !validEmail(
      to,
    )
  ) {
    throw new Error(
      "The contact email recipient is invalid.",
    );
  }

  const subject =
    headerSafe(
      input.subject,
    );

  if (!subject) {
    throw new Error(
      "Contact email subject is required.",
    );
  }

  const bodyText =
    input.bodyText.trim();

  if (!bodyText) {
    throw new Error(
      "Contact email body is required.",
    );
  }

  const username =
    smtpUsername();

  const port =
    smtpPort();

  const transporter =
    nodemailer.createTransport({
      host:
        smtpHost(),

      port,

      secure:
        port === 465,

      auth: {
        user:
          username,

        pass:
          smtpPassword(),
      },

      connectionTimeout:
        15_000,

      greetingTimeout:
        15_000,

      socketTimeout:
        30_000,
    });

  const message =
    await transporter.sendMail({
      from:
        `"DueQuity" <${DUEQUITY_CONTACT_EMAIL}>`,

      to,

      replyTo:
        DUEQUITY_CONTACT_EMAIL,

      subject,

      text:
        `${bodyText}

DueQuity
Public Inquiries & Communications
${DUEQUITY_CONTACT_EMAIL}
${DUEQUITY_CONTACT_PHONE}
A Westforge Holdings Inc. product`,
    });

  return {
    messageId:
      message.messageId ||
      undefined,
  };
}