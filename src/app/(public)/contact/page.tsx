import type {
  Metadata,
} from "next";

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

import {
  TextLink,
} from "@/components/ui/button";

import {
  DUEQUITY_CONTACT_EMAIL,
  DUEQUITY_CONTACT_PHONE,
} from "@/server/contact-email-transport";

import {
  submitPublicContactInquiry,
} from "./actions";

export const metadata:
  Metadata = {
  title:
    "Contact",

  description:
    "Contact DueQuity with a general inquiry, surplus recovery question, business inquiry, or request to verify a DueQuity contact.",
};

interface ContactPageProps {
  searchParams:
    Promise<{
      status?: string;
    }>;
}

export default async function ContactPage({
  searchParams,
}: ContactPageProps) {
  const params =
    await searchParams;

  const submitted =
    params.status ===
    "sent";

  return (
    <>
      <Section
        tone="ink"
        size="sm"
      >
        <Container>
          <p className="eyebrow text-accent-300">
            Contact
          </p>

          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            {submitted
              ? "Thank you for contacting DueQuity"
              : "Speak to DueQuity"}
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            {submitted
              ? "Your inquiry has been received by our team."
              : "Ask a question about surplus recovery, verify a DueQuity contact, or send us a general inquiry."}
          </p>
        </Container>
      </Section>

      <Section
        tone="paper"
        size="md"
      >
        <Container>
          {submitted ? (
            <div className="mx-auto max-w-3xl">
              <Card>
                <CardBody>
                  <div className="py-6 text-center sm:py-10">
                    <p className="eyebrow text-accent-700">
                      Inquiry received
                    </p>

                    <h2 className="mt-3 font-serif text-3xl font-semibold text-ink-950 sm:text-4xl">
                      Thank you for reaching out.
                    </h2>

                    <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-600">
                      Your inquiry has been successfully submitted to DueQuity.
                      A member of our staff will review your message and reach
                      out to you shortly using the contact information you
                      provided.
                    </p>

                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-ink-500">
                      Please do not submit another message about the same inquiry
                      unless you need to provide important additional
                      information.
                    </p>

                    <div className="mt-8 flex justify-center">
                      <a
                        href="/"
                        className="rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                      >
                        Return to Home Page
                      </a>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Callout
                tone="neutral"
                className="mt-6"
                title="Need immediate claimant support?"
              >
                <p>
                  You can also reach DueQuity by phone at{" "}
                  <a
                    href="tel:+18663317778"
                    className="font-semibold underline"
                  >
                    {DUEQUITY_CONTACT_PHONE}
                  </a>
                  .
                </p>
              </Callout>
            </div>
          ) : (
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
              <div className="min-w-0">
                <SectionIntro
                  eyebrow="Send us a message"
                  title="How can we help?"
                  lede="Use the form below for ordinary questions and public inquiries. Please do not submit sensitive identity or financial information."
                />

                {params.status ===
                "invalid" ? (
                  <Callout
                    tone="critical"
                    className="mt-6"
                    role="alert"
                    title="Check your message"
                  >
                    <p>
                      Please complete all required fields and enter a valid
                      email address.
                    </p>
                  </Callout>
                ) : null}

                {params.status ===
                "rate-limited" ? (
                  <Callout
                    tone="caution"
                    className="mt-6"
                    role="alert"
                    title="Please wait before sending another message"
                  >
                    <p>
                      Several recent inquiries were submitted using this email
                      address. Please wait before trying again.
                    </p>
                  </Callout>
                ) : null}

                {params.status ===
                "unavailable" ? (
                  <Callout
                    tone="critical"
                    className="mt-6"
                    role="alert"
                    title="Message could not be submitted"
                  >
                    <p>
                      Please try again later or email DueQuity directly at{" "}
                      <a
                        href={`mailto:${DUEQUITY_CONTACT_EMAIL}`}
                        className="font-medium underline"
                      >
                        {DUEQUITY_CONTACT_EMAIL}
                      </a>
                      .
                    </p>
                  </Callout>
                ) : null}

                <Card className="mt-7">
                  <CardHeader
                    title="Contact form"
                    description="Required fields must be completed before your message can be submitted."
                  />

                  <CardBody>
                    <form
                      action={
                        submitPublicContactInquiry
                      }
                      className="space-y-5"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
                      >
                        <label htmlFor="website">
                          Website
                        </label>

                        <input
                          id="website"
                          name="website"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            htmlFor="name"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Full name
                          </label>

                          <input
                            id="name"
                            name="name"
                            type="text"
                            autoComplete="name"
                            maxLength={120}
                            required
                            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="email"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Email
                          </label>

                          <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                            required
                            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="phone"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Phone{" "}
                            <span className="font-normal text-ink-500">
                              optional
                            </span>
                          </label>

                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            autoComplete="tel"
                            maxLength={40}
                            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="category"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Inquiry type
                          </label>

                          <select
                            id="category"
                            name="category"
                            defaultValue="general"
                            required
                            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                          >
                            <option value="general">
                              General inquiry
                            </option>

                            <option value="claim_question">
                              Surplus recovery question
                            </option>

                            <option value="partnership">
                              Partnership or business
                            </option>

                            <option value="media">
                              Media
                            </option>

                            <option value="other">
                              Other
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="subject"
                          className="block text-sm font-medium text-ink-800"
                        >
                          Subject
                        </label>

                        <input
                          id="subject"
                          name="subject"
                          type="text"
                          maxLength={200}
                          required
                          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="message"
                          className="block text-sm font-medium text-ink-800"
                        >
                          Message
                        </label>

                        <textarea
                          id="message"
                          name="message"
                          rows={8}
                          maxLength={10000}
                          required
                          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm leading-6 text-ink-900 outline-none transition focus:border-ink-500"
                        />
                      </div>

                      <Callout
                        tone="neutral"
                        title="Protect your information"
                      >
                        <p>
                          Do not submit Social Security numbers, bank account
                          information, passwords, full government identification
                          numbers, or images of identity documents through this
                          public form.
                        </p>
                      </Callout>

                      <p className="text-xs leading-relaxed text-ink-500">
                        Submitting this form does not create a claim, establish
                        entitlement to funds, or create an attorney-client
                        relationship.
                      </p>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                        >
                          Send message
                        </button>
                      </div>
                    </form>
                  </CardBody>
                </Card>

                <Callout
                  tone="neutral"
                  className="mt-6"
                  title="You can always claim directly"
                >
                  <p>
                    You may pursue surplus funds yourself directly with the
                    government agency or court holding the funds without using
                    DueQuity. See{" "}
                    <TextLink href="/fees">
                      how fees work
                    </TextLink>{" "}
                    for more information.
                  </p>
                </Callout>
              </div>

              <aside className="min-w-0 space-y-6">
                <Card>
                  <CardHeader title="Contact DueQuity" />

                  <CardBody>
                    <DataList>
                      <DataItem label="Email">
                        <a
                          href={`mailto:${DUEQUITY_CONTACT_EMAIL}`}
                          className="font-mono text-sm hover:underline"
                        >
                          {DUEQUITY_CONTACT_EMAIL}
                        </a>
                      </DataItem>

                      <DataItem label="Phone">
                        <a
                          href="tel:+18663317778"
                          className="font-mono text-sm hover:underline"
                        >
                          {DUEQUITY_CONTACT_PHONE}
                        </a>
                      </DataItem>
                    </DataList>
                  </CardBody>
                </Card>

                <Callout
                  tone="caution"
                  title="Verify before you share"
                >
                  <p>
                    If you received a letter, email, or call claiming to be
                    DueQuity, verify it before sharing sensitive information.
                    Enter the code from the communication at{" "}
                    <TextLink href="/verify">
                      duequity.com/verify
                    </TextLink>
                    , or contact us directly at{" "}
                    <a
                      href={`mailto:${DUEQUITY_CONTACT_EMAIL}`}
                      className="font-medium underline"
                    >
                      {DUEQUITY_CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                </Callout>

                <Card inset>
                  <CardBody>
                    <p className="eyebrow text-ink-500">
                      Westforge Holdings Inc.
                    </p>

                    <Prose>
                      <p>
                        DueQuity is a product of Westforge Holdings Inc.
                      </p>

                      <p>
                        DueQuity is not a law firm and does not provide legal
                        advice.
                      </p>
                    </Prose>
                  </CardBody>
                </Card>
              </aside>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}