import type { Metadata } from "next";
import {
  Container,
  Prose,
  Section,
  SectionIntro,
} from "@/components/public/section";
import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  DataItem,
  DataList,
} from "@/components/ui/surface";
import { TextLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Duequity. Speak to a recovery specialist, verify a contact you received, or reach our compliance and security teams.",
};

/**
 * CONTACT
 *
 * This page publishes contact channels rather than presenting a web form.
 *
 * WHY THERE IS NO FORM
 *
 * There is no message transport configured. The form that previously stood here
 * validated a name, an email address, a phone number and a free-text message, then
 * displayed a confirmation without transmitting or storing anything.
 *
 * That is not an acceptable state for a contact surface. Someone writing to a
 * surplus-recovery company may be describing a bereavement, a foreclosure, or a
 * message they suspect is a scam. Collecting that and discarding it, behind a
 * confirmation that says the message is ready to send, is worse than offering no
 * form: the sender waits for a reply that cannot come.
 *
 * A direct address is honest, works today, and gives the sender a record of what
 * they sent. When a message transport is configured, a form can return here.
 */
export default function ContactPage() {
  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Contact</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            Speak to a specialist
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            You do not need to know whether you have a claim before you contact
            us. If you received something from us and want to check that it is
            genuine, that is a good reason to write as well.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
            <div className="min-w-0">
              <SectionIntro
                eyebrow="How to reach us"
                title="Write to the address that matches your reason"
                lede="Email reaches a person. There is deliberately no web form on this page, because a form that cannot deliver your message is worse than no form at all."
              />

              <Card className="mt-7">
                <CardBody>
                  <Prose>
                    <p>
                      Include the property address, the county, and a case or
                      list reference if you have one. Those three things let us
                      find the public record you are asking about.
                    </p>

                    <p>
                      <strong>Please do not send</strong> a Social Security
                      number, bank details, or images of identity documents in a
                      first message. We do not need any of them to answer a
                      question, and email is the wrong channel for them. If
                      anyone asks you for them by email while claiming to be
                      Duequity, that request did not come from us.
                    </p>

                    <p>
                      We answer as a small team. If your message concerns a
                      statutory deadline, say so in the subject line.
                    </p>
                  </Prose>
                </CardBody>
              </Card>

              <Callout
                tone="neutral"
                className="mt-6"
                title="You can always claim directly, for free"
              >
                <p>
                  Whatever you write to us about, you may pursue a surplus claim
                  yourself, directly with the agency holding the funds, at no
                  cost and without involving Duequity. See{" "}
                  <TextLink href="/fees">how fees work</TextLink> for how to do
                  that, including the steps and who to ask.
                </p>
              </Callout>
            </div>

            <aside className="min-w-0 space-y-6">
              <Card>
                <CardHeader title="Direct contact" />
                <CardBody>
                  <DataList>
                    <DataItem label="General enquiries">
                      <span className="font-mono text-sm">
                        hello@duequity.com
                      </span>
                    </DataItem>
                    <DataItem label="Existing claimants">
                      <span className="font-mono text-sm">
                        support@duequity.com
                      </span>
                    </DataItem>
                    <DataItem label="Report a suspicious contact">
                      <span className="font-mono text-sm">
                        security@duequity.com
                      </span>
                    </DataItem>
                    <DataItem label="Compliance and legal">
                      <span className="font-mono text-sm">
                        compliance@duequity.com
                      </span>
                    </DataItem>
                    <DataItem label="Attorney network">
                      <span className="font-mono text-sm">
                        counsel@duequity.com
                      </span>
                    </DataItem>
                  </DataList>
                </CardBody>
              </Card>

              <Callout tone="caution" title="Verify before you share">
                <p>
                  If you received a letter, email or call claiming to be
                  Duequity, verify it before sharing anything. Enter the code
                  from the message at{" "}
                  <TextLink href="/verify">duequity.com/verify</TextLink>, or
                  write to us at the address above rather than replying to the
                  message.
                </p>
              </Callout>

              <Card inset>
                <CardBody>
                  <p className="eyebrow text-ink-500">
                    Westforge Holdings Inc.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    Duequity is a product of Westforge Holdings Inc.
                    Correspondence regarding the company should be directed to
                    the compliance address above.
                  </p>
                </CardBody>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
