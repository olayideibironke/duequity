import type { Metadata } from "next";

import { Container, Section } from "@/components/public/section";

import {
  Callout,
  Card,
  CardBody,
  EmptyState,
  GovernmentDisclosure,
} from "@/components/ui/surface";

import { TextLink } from "@/components/ui/button";

import { CheckForm } from "@/components/public/check-form";

import { MatchCard } from "@/components/public/match-card";

import { searchPublic } from "@/server/public-search";

import { plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Check a property",

  description:
    "Search Duequity's reviewed surplus-recovery records by property address or former owner name.",
};

export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: PageProps<"/check">) {
  const params = await searchParams;

  const query = {
    address: single(params.address),

    ownerName: single(params.owner),

    state: single(params.state),

    county: single(params.county),
  };

  const result = await searchPublic(query);

  const hasSearched = result.kind !== "empty_query";

  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <div className="max-w-2xl">
            <p className="eyebrow text-accent-300">Property search</p>

            <h1 className="mt-3 text-3xl text-white sm:text-4xl">
              Check a property for possible surplus funds
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              Enter a property address or the name of a former owner. No account
              is required, and we do not ask for a Social Security number, date
              of birth, or identity documents to run the search.
            </p>
          </div>
        </Container>
      </Section>

      <Section tone="paper" size="sm">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <div className="min-w-0">
              <Card>
                <CardBody>
                  <CheckForm initial={query} />
                </CardBody>
              </Card>

              {hasSearched && (
                <div className="mt-10">
                  {result.kind === "matches" ? (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h2 className="text-xl">
                          {result.matches.length}{" "}
                          {plural(result.matches.length, "possible record")}{" "}
                          found
                        </h2>

                        <p className="text-sm text-ink-500">
                          Amounts are not shown publicly.
                        </p>
                      </div>

                      <Callout tone="neutral" className="mt-4">
                        <p>
                          A match means Duequity found a reviewed or official
                          public record fitting the search. It does not
                          establish that the person searching is legally
                          entitled to the funds.
                        </p>
                      </Callout>

                      <div className="mt-6 space-y-6">
                        {result.matches.map((match) => (
                          <MatchCard key={match.token} match={match} />
                        ))}
                      </div>
                    </>
                  ) : result.kind === "source_unavailable" ? (
                    <SourceUnavailable
                      sourceName={result.sourceName}
                      message={result.message}
                    />
                  ) : result.kind === "coverage_unavailable" ? (
                    <CoverageUnavailable message={result.message} />
                  ) : (
                    <NoMatch />
                  )}
                </div>
              )}
            </div>

            <aside className="min-w-0 space-y-6">
              <Card inset>
                <CardBody>
                  <h2 className="font-sans text-base font-semibold text-ink-900">
                    How the search works
                  </h2>

                  <ol className="mt-3 space-y-2.5">
                    {[
                      "Search by address or former owner",
                      "Resolve the property's state and county",
                      "Search an activated official source where available",
                      "Review the government record independently",
                    ].map((step, index) => (
                      <li key={step} className="flex gap-2.5 text-sm">
                        <span
                          aria-hidden="true"
                          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper font-mono text-2xs text-ink-500"
                        >
                          {index + 1}
                        </span>

                        <span className="text-ink-600">{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>

              <Card inset>
                <CardBody>
                  <h2 className="font-sans text-base font-semibold text-ink-900">
                    Verify independently
                  </h2>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    When Duequity finds an official record, the result
                    identifies the government source so you can check it
                    yourself.
                  </p>

                  <p className="mt-3 text-sm">
                    <TextLink href="/states">
                      Review jurisdiction coverage
                    </TextLink>
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

function NoMatch() {
  return (
    <>
      <h2 className="text-xl">No matching record found</h2>

      <EmptyState
        className="mt-4"
        title="The searched official source did not contain a matching record"
        description="This result applies only to the source Duequity searched. Public records can change, and other surplus sources may exist."
      />

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm leading-relaxed text-ink-600">
            Try the former owner&apos;s recorded name, confirm the property
            address, or check the responsible government agency directly.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function CoverageUnavailable({ message }: { message: string }) {
  return (
    <>
      <h2 className="text-xl">Official search not activated here yet</h2>

      <Callout
        tone="caution"
        className="mt-4"
        title="Duequity cannot give a reliable no-match result for this jurisdiction"
      >
        <p>{message} This does not mean that no surplus funds exist.</p>
      </Callout>

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm leading-relaxed text-ink-600">
            You may contact the county, court, treasurer, tax collector,
            trustee, sheriff, or other relevant public custodian directly while
            Duequity expands live-source coverage.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function SourceUnavailable({
  sourceName,
  message,
}: {
  sourceName: string;

  message: string;
}) {
  return (
    <>
      <h2 className="text-xl">Official source temporarily unavailable</h2>

      <Callout tone="caution" className="mt-4" title={sourceName}>
        <p>
          {message} Duequity is not treating the source failure as proof that no
          record exists.
        </p>
      </Callout>
    </>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
