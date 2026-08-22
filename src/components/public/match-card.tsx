import Link from "next/link";

import type { IsoDate } from "@/domain/types";

import { assessDeadline } from "@/domain/compliance";

import { CUSTODIAN_LABEL, SALE_TYPE_LABEL } from "@/domain/status";

import type { PublicMatch } from "@/server/public-search";

import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DataItem,
  DataList,
  NotRecorded,
} from "@/components/ui/surface";

import { Badge, Identifier } from "@/components/ui/badge";

import { ButtonLink, TextLink } from "@/components/ui/button";

import { formatDate, formatPhone } from "@/lib/format";

import { IconArrowRight, IconPhone } from "@/components/ui/icon";

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `tel:+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `tel:+${digits}`;
  }

  return `tel:${digits}`;
}

export function MatchCard({ match }: { match: PublicMatch }) {
  const deadline = assessDeadline(match.claimDeadline, currentIsoDate());

  return (
    <Card elevated>
      <CardHeader
        eyebrow="Possible record found"
        title={
          <span className="text-lg">
            {match.addressMasked}, {match.city}, {match.state}
          </span>
        }
        description={`${match.county}, ${match.state}`}
        actions={<SurplusStatusBadge status={match.surplusStatus} />}
      />

      <CardBody>
        <DataList columns={2}>
          <DataItem label="Sale type">
            {SALE_TYPE_LABEL[match.saleType]}
          </DataItem>

          <DataItem label="Sale date">{formatDate(match.saleDate)}</DataItem>

          <DataItem label="Case number">
            {match.caseNumber ? (
              <Identifier>{match.caseNumber}</Identifier>
            ) : (
              <NotRecorded />
            )}
          </DataItem>

          <DataItem label="Property / parcel ID">
            {match.parcelNumber ? (
              <Identifier>{match.parcelNumber}</Identifier>
            ) : (
              <NotRecorded />
            )}
          </DataItem>

          <DataItem label="Funds custodian" span>
            <span className="block">{match.agencyName}</span>

            <span className="mt-0.5 block text-sm text-ink-500">
              {CUSTODIAN_LABEL[match.custodian]}
            </span>
          </DataItem>

          <DataItem label="Claim deadline" span>
            {match.claimDeadline ? (
              <span className="flex flex-wrap items-baseline gap-2">
                <span>{formatDate(match.claimDeadline)}</span>

                <Badge
                  tone={
                    deadline.risk === "expired" || deadline.risk === "critical"
                      ? "critical"
                      : deadline.risk === "elevated"
                        ? "caution"
                        : "neutral"
                  }
                >
                  {deadline.label}
                </Badge>
              </span>
            ) : (
              <NotRecorded label="No approved deadline rule is currently attached to this public result" />
            )}
          </DataItem>
        </DataList>

        <div className="mt-5 rounded-md border border-line bg-inset px-4 py-3.5">
          <p className="text-sm font-semibold text-ink-900">
            Check the public record yourself
          </p>

          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Duequity found this through{" "}
            <span className="font-medium text-ink-800">{match.sourceName}</span>
            {match.sourceReference && (
              <>
                {" "}
                under{" "}
                <span className="font-mono text-xs">
                  {match.sourceReference}
                </span>
              </>
            )}
            .
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {match.agencyPhone && (
              <a
                href={phoneHref(match.agencyPhone)}
                className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
              >
                <IconPhone size={15} />

                {formatPhone(match.agencyPhone)}
              </a>
            )}

            {match.sourceUrl && (
              <TextLink href={match.sourceUrl} external className="text-sm">
                Open official source
              </TextLink>
            )}

            <Link
              href={`/states/${match.jurisdictionSlug.state}/${match.jurisdictionSlug.county}`}
              className="rounded-sm text-sm font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
            >
              Jurisdiction information
            </Link>
          </div>
        </div>

        {match.intake !== "open" && (
          <div
            className={
              match.intake === "attorney_required"
                ? "mt-4 rounded-md border border-counsel-200 bg-counsel-50 px-4 py-3.5"
                : "mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3.5"
            }
          >
            <p className="text-sm font-semibold text-ink-900">
              {match.intake === "attorney_required"
                ? "Independent legal handling may be required"
                : "Record found, Duequity intake not yet available"}
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {match.intakeExplanation}
            </p>
          </div>
        )}
      </CardBody>

      <CardFooter>
        <p className="text-sm text-ink-600">
          No recovery amount or claimant-sensitive information is shown
          publicly.
        </p>

        {match.intake === "closed" ? (
          <TextLink
            href={
              match.sourceUrl ??
              `/states/${match.jurisdictionSlug.state}/${match.jurisdictionSlug.county}`
            }
            external={Boolean(match.sourceUrl)}
            className="text-sm"
          >
            Verify directly
          </TextLink>
        ) : (
          <ButtonLink
            href={`/verify/${match.token}`}
            variant="primary"
            accent
            trailing={<IconArrowRight size={16} />}
          >
            Continue
          </ButtonLink>
        )}
      </CardFooter>
    </Card>
  );
}

export function SurplusStatusBadge({
  status,
}: {
  status: PublicMatch["surplusStatus"];
}) {
  if (status === "confirmed_by_agency") {
    return (
      <Badge
        tone="positive"
        size="md"
        title="The responsible public source lists this record as surplus funds."
      >
        Official surplus record
      </Badge>
    );
  }

  if (status === "possible") {
    return (
      <Badge tone="caution" size="md">
        Possible surplus
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" size="md">
      Under research
    </Badge>
  );
}
