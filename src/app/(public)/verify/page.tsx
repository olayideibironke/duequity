import type { Metadata } from "next";
import { Container, Section } from "@/components/public/section";
import {
  Callout,
  Card,
  CardBody,
  GovernmentDisclosure,
} from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";
import { VerifyCodeForm } from "@/components/public/verify-code-form";
import { MatchCard } from "@/components/public/match-card";
import {
  lookupOutreachVerificationCode,
  outreachVerificationAvailable,
} from "@/server/outreach-verification";

export const metadata: Metadata = {
  title: "Verify a contact",
  description:
    "Received a letter, email or call from Duequity? Enter the verification code to confirm it is genuine and to see the public record it refers to.",
};

export const dynamic = "force-dynamic";

/**
 * VERIFY A CONTACT
 *
 * This page exists because the honest answer to "is this a scam?" is "here is how
 * to check".
 *
 * Every piece of Duequity outreach carries a code. Entering it confirms the contact
 * came from us and shows the public record behind it. A code that does not resolve
 * produces an explicit warning rather than a vague error, because a failed lookup is
 * the most important result this page can return.
 *
 * CURRENT STATE
 *
 * Duequity has sent no outreach, so there is no code that can resolve, and every
 * lookup returns "not recognised". The page says exactly that rather than implying
 * the visitor mistyped something, and it does not publish example codes: a page
 * that hands out codes which resolve would teach a visitor that a resolving code
 * proves nothing.
 */

export default async function VerifyPage({
  searchParams,
}: PageProps<"/verify">) {
  const params = await searchParams;

  const raw = Array.isArray(params.code) ? params.code[0] : params.code;

  const result = await lookupOutreachVerificationCode(raw);

  const verificationAvailable = outreachVerificationAvailable();

  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <div className="max-w-2xl">
            <p className="eyebrow text-accent-300">Verification</p>
            <h1 className="mt-3 text-3xl text-white sm:text-4xl">
              Check that a contact really came from Duequity
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              Every letter, email and call we make carries a verification code.
              Enter it below to confirm the contact is genuine and to see the
              public record it refers to.
            </p>
          </div>
        </Container>
      </Section>

      <Section tone="paper" size="sm">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <div className="min-w-0">
              {!verificationAvailable && (
                <Callout
                  tone="critical"
                  role="alert"
                  className="mb-6"
                  title="Duequity has not contacted anyone yet"
                >
                  <div className="space-y-2">
                    <p>
                      Duequity has not sent any letters, emails, calls or text
                      messages. No verification code has been issued, so no code
                      entered here can be genuine.
                    </p>
                    <p>
                      <span className="font-semibold text-ink-900">
                        If you received a message claiming to be from Duequity,
                        it did not come from us.
                      </span>{" "}
                      Do not send documents, do not pay anything, and do not
                      give out a Social Security number or bank details. Please
                      forward it to{" "}
                      <span className="font-mono text-sm">
                        security@duequity.com
                      </span>{" "}
                      so we can act on the impersonation.
                    </p>
                  </div>
                </Callout>
              )}

              <Card>
                <CardBody>
                  <VerifyCodeForm initialCode={raw ?? ""} />
                </CardBody>
              </Card>

              {result.kind === "found" && (
                <div className="mt-8">
                  <Callout
                    tone="positive"
                    role="status"
                    title="This contact is genuine"
                  >
                    <p>
                      The code you entered matches outreach we issued. Below is
                      the public case it refers to, including the agency holding
                      the funds so you can confirm it independently.
                    </p>
                  </Callout>
                  <div className="mt-6">
                    <MatchCard match={result.match} />
                  </div>
                </div>
              )}

              {result.kind === "malformed" && (
                <div className="mt-8">
                  <Callout
                    tone="caution"
                    role="alert"
                    title="That is not the right shape for a code"
                  >
                    <p>
                      Duequity verification codes are exactly four characters,
                      letters and digits only. Check the code again,
                      particularly a zero against the letter O.
                    </p>
                  </Callout>
                </div>
              )}

              {result.kind === "not_found" && (
                <div className="mt-8">
                  <Callout
                    tone="critical"
                    role="alert"
                    title="We do not recognise that code"
                  >
                    <div className="space-y-2">
                      <p>
                        That code does not match any outreach we have issued.
                        There are two likely explanations, and both matter.
                      </p>
                      <p>
                        <span className="font-semibold text-ink-900">
                          It may be a typing error.
                        </span>{" "}
                        Codes are four characters. Check the letters and numbers
                        again, particularly a zero against the letter O.
                      </p>
                      <p>
                        <span className="font-semibold text-ink-900">
                          Or the contact did not come from us.
                        </span>{" "}
                        If you are confident you typed it correctly, treat the
                        message with suspicion. Do not send documents, do not
                        pay anything, and do not give out a Social Security
                        number or bank details.
                      </p>
                      <p>
                        Please forward it to{" "}
                        <span className="font-mono text-sm">
                          security@duequity.com
                        </span>{" "}
                        so we can look into it. Reporting costs you nothing and
                        helps us shut down impersonation.
                      </p>
                    </div>
                  </Callout>
                </div>
              )}
            </div>

            <aside className="min-w-0 space-y-6">
              <Card inset>
                <CardBody>
                  <h2 className="font-sans text-base font-semibold text-ink-900">
                    What a real Duequity letter contains
                  </h2>
                  <ul className="mt-3 space-y-2 text-sm text-ink-600">
                    {[
                      "A four character verification code",
                      "The specific property address it concerns",
                      "The public case number we relied on",
                      "The name of the agency holding the funds",
                      "A statement that we are not a government agency",
                      "A statement that you may claim directly at no cost",
                      "No request for payment of any kind",
                    ].map((item) => (
                      <li key={item} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1 shrink-0 rounded-full bg-accent-500"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs leading-relaxed text-ink-500">
                    We never ask for money before a recovery, and we never ask
                    for a Social Security number or bank details in a first
                    contact. See{" "}
                    <TextLink href="/security" className="text-xs">
                      how to spot a scam
                    </TextLink>
                    .
                  </p>
                </CardBody>
              </Card>

              <GovernmentDisclosure />
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
