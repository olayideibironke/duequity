import type { Metadata } from "next";
import {
  Container,
  Prose,
  Section,
  SectionIntro,
} from "@/components/public/section";
import { Callout, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { TextLink } from "@/components/ui/button";
import {
  IconDocument,
  IconLock,
  IconShield,
  IconAudit,
} from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Duequity protects claimant identity documents, legal records and financial information: encryption, access control, audit logging, and a deliberate policy of collecting less.",
};

/**
 * SECURITY
 *
 * Section 13 lists the security architecture. This page states the parts a claimant
 * can act on, in plain language, and is explicit about what is implemented now
 * versus what is scheduled before production.
 *
 * The honesty about current state is intentional. A security page that implies
 * completed certification a company does not hold is itself a trust failure.
 */
export default function SecurityPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Security and privacy</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            You are handing us identity documents. We take that seriously.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            A surplus claim requires the most sensitive paperwork most people
            own: government identification, death certificates, deeds, probate
            records. The first line of defence is not encryption. It is asking
            for less.
          </p>
        </Container>
      </Section>

      {/* ================================================== COLLECT LESS FIRST */}
      <Section tone="paper" size="md">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <SectionIntro
                eyebrow="Data minimisation"
                title="What we deliberately do not ask for"
                lede="Every field we do not collect is a field that cannot be breached. This is a design constraint in the product, not a policy statement."
              />
              <div className="mt-7 space-y-5">
                <Point title="No Social Security number to search">
                  Searching a property requires an address or a name. Nothing
                  more. We do not ask for a Social Security number unless a
                  specific agency requires one to process a payment, and where
                  it does, the number is handled by our identity verification
                  provider rather than stored in our own records.
                </Point>
                <Point title="No documents before you decide">
                  You see the case record, the agency and the surplus status
                  before any document is requested. If you decide not to
                  proceed, we never received anything sensitive to lose.
                </Point>
                <Point title="No banking details">
                  Agencies pay you directly. We are never a payee, so we have no
                  reason to hold your account information and we do not ask for
                  it.
                </Point>
                <Point title="No date of birth by default">
                  Collected only where a jurisdiction requires it to adjudicate
                  a claim, and only for that jurisdiction.
                </Point>
              </div>
            </div>

            <div className="lg:pt-2">
              <Card elevated>
                <CardHeader
                  title="How documents are handled"
                  description="From upload to disposal."
                />
                <CardBody className="space-y-4">
                  <Flow
                    step="On upload"
                    detail="Files are validated by type and size, then encrypted before they are written to storage. Nothing is served from a public path."
                  />
                  <Flow
                    step="At rest"
                    detail="Documents live in private object storage under opaque keys with no meaningful filename. Restricted documents such as identification are classified separately from public records like a recorded deed."
                  />
                  <Flow
                    step="On access"
                    detail="Every view is authorised on the server against your role, then issued a short lived signed link. A staff member who lacks the permission is refused, and the refusal is logged."
                  />
                  <Flow
                    step="In our logs"
                    detail="We log that a document was viewed, by whom, and when. We never log its contents, and we never log credentials, tokens or government identifiers."
                  />
                  <Flow
                    step="At the end"
                    detail="Documents are retained while a claim is live and for the period the applicable rules require, then deleted on a schedule. You may request deletion of anything not subject to a retention obligation."
                  />
                </CardBody>
              </Card>
            </div>
          </div>
        </Container>
      </Section>

      {/* ============================================================ CONTROLS */}
      <Section tone="canvas" size="md">
        <Container>
          <SectionIntro
            eyebrow="Controls"
            title="The architecture"
            lede="Duequity is built on the assumption that any single control will eventually fail, so authorisation is enforced at the server on every request rather than by hiding a button."
          />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Control
              icon={<IconLock size={18} />}
              title="Encryption"
              items={[
                "Encrypted in transit on every request",
                "Encrypted at rest in document storage",
                "Signed, expiring access links",
                "Secrets held outside the codebase",
              ]}
            />
            <Control
              icon={<IconShield size={18} />}
              title="Access control"
              items={[
                "Role based permissions, least privilege",
                "Server side authorisation on every request",
                "Multi factor authentication for staff",
                "Session expiry and revocation",
              ]}
            />
            <Control
              icon={<IconAudit size={18} />}
              title="Accountability"
              items={[
                "Immutable audit log of sensitive actions",
                "Failed access attempts recorded",
                "Document views attributed to a person",
                "Compliance changes attributed and dated",
              ]}
            />
            <Control
              icon={<IconDocument size={18} />}
              title="Application hardening"
              items={[
                "Input validation on every submission",
                "File type and size restrictions",
                "Rate limiting on sensitive endpoints",
                "Secure response headers",
              ]}
            />
          </div>

          <Callout
            tone="neutral"
            className="mt-10"
            title="Where this build stands"
          >
            <div className="space-y-2">
              <p>
                We would rather be precise than impressive. The security
                architecture above is designed and the application enforces its
                boundaries today: document sensitivity classification, a
                server-side permission vocabulary checked on every action, state
                clearance, audit event structure and secure response headers are
                all implemented.
              </p>
              <p>
                Authentication, the identity verification provider integration,
                encrypted object storage, malware scanning and rate limiting are
                infrastructure integrations that must be completed before any
                claimant data enters the system. Until they are, the application
                fails closed: no authenticated session can be established, the
                claimant portal will not accept a document, and no claimant
                information is held.
              </p>
            </div>
          </Callout>
        </Container>
      </Section>

      {/* ============================================================== SCAMS */}
      <Section tone="paper" size="md">
        <Container width="reading">
          <SectionIntro
            eyebrow="Protecting yourself"
            title="How to tell a legitimate approach from a scam"
            lede="This applies to us as much as anyone. If a contact claiming to be Duequity does any of the following, it is not us."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Warning>
              Asks for a payment, a fee, a deposit, or a gift card before any
              money has been recovered
            </Warning>
            <Warning>
              Asks for your Social Security number or bank account details in a
              first contact
            </Warning>
            <Warning>
              Claims to be from a court, county or government office
            </Warning>
            <Warning>
              Pressures you to sign immediately or says the opportunity expires
              today
            </Warning>
            <Warning>Refuses to tell you which agency holds the funds</Warning>
            <Warning>Guarantees you will receive a specific amount</Warning>
            <Warning>
              Asks you to sign over or sell your claim rather than be
              represented
            </Warning>
            <Warning>Will not put the fee in writing before you commit</Warning>
          </div>

          <Prose className="mt-8">
            <h2>Verifying a contact from us</h2>
            <p>
              Every written approach from Duequity carries a verification code
              and names the public case record it relates to. You can:
            </p>
            <ul>
              <li>
                Enter the code at{" "}
                <TextLink href="/verify">duequity.com/verify</TextLink> to
                confirm the contact came from us
              </li>
              <li>
                Look up the case number yourself in the court or county records
                we cite
              </li>
              <li>
                Call the agency we name and ask them directly whether surplus
                funds are held
              </li>
              <li>
                Reach us on our published contact details rather than replying
                to the message you received
              </li>
            </ul>
            <p>
              If something feels wrong, stop and verify. A legitimate claim will
              still be there tomorrow, and any real deadline is measured in
              months or years, not hours.
            </p>
          </Prose>

          <Callout
            tone="caution"
            className="mt-8"
            title="Report a suspicious contact"
          >
            <p>
              If you receive something that claims to be from Duequity and you
              doubt it, tell us. Forward it to{" "}
              <span className="font-mono text-sm">security@duequity.com</span>{" "}
              and we will confirm whether it came from us. Reporting costs you
              nothing and helps us shut down impersonation.
            </p>
          </Callout>
        </Container>
      </Section>
    </>
  );
}

function Point({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-accent-200 pl-4">
      <h3 className="font-sans text-base font-semibold text-ink-900">
        {title}
      </h3>
      <p className="mt-1 text-md leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function Flow({ step, detail }: { step: string; detail: string }) {
  return (
    <div>
      <p className="eyebrow text-accent-700">{step}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{detail}</p>
    </div>
  );
}

function Control({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <Card>
      <CardBody>
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-inset text-accent-700"
        >
          {icon}
        </span>
        <h3 className="mt-3 font-sans text-base font-semibold text-ink-900">
          {title}
        </h3>
        <ul className="mt-2.5 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink-600">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-300"
              />
              {item}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-critical-200 bg-critical-50 px-3.5 py-3">
      <Badge tone="critical" className="mt-0.5 shrink-0">
        Not us
      </Badge>
      <p className="text-sm leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}
