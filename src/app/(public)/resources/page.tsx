import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionIntro } from "@/components/public/section";
import { Card, CardBody } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { RESOURCE_ARTICLES } from "@/content/resources";
import { formatDate } from "@/lib/format";
import { IconArrowRight } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Plain language explanations of property surplus funds: what they are, how heirs claim them, why rules differ by county, and how to recognise a scam.",
};

export default function ResourcesPage() {
  const categories = [...new Set(RESOURCE_ARTICLES.map((a) => a.category))];

  return (
    <>
      <Section tone="ink" size="sm">
        <Container>
          <p className="eyebrow text-accent-300">Resources</p>
          <h1 className="mt-3 max-w-3xl text-3xl text-white sm:text-4xl">
            Understanding surplus funds
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            Written to explain how the process actually works, including the
            parts that argue against using a service like ours. These are not
            sales pages.
          </p>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container>
          {categories.map((category) => {
            const articles = RESOURCE_ARTICLES.filter(
              (a) => a.category === category,
            );
            return (
              <div key={category} className="mb-14 last:mb-0">
                <SectionIntro
                  eyebrow={category}
                  title={categoryHeading(category)}
                />
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  {articles.map((article) => (
                    <Card
                      key={article.slug}
                      className="transition-colors hover:border-ink-300"
                    >
                      <CardBody>
                        <Link
                          href={`/resources/${article.slug}`}
                          className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                        >
                          <div className="flex items-center gap-2">
                            <Badge tone="neutral">{article.category}</Badge>
                            <span className="text-2xs text-ink-500">
                              {article.readingMinutes} minute read
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg leading-snug font-semibold text-ink-900 group-hover:text-accent-700">
                            {article.title}
                          </h3>
                          <p className="mt-2 text-md leading-relaxed text-ink-600">
                            {article.summary}
                          </p>
                          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent-700">
                            Read
                            <IconArrowRight size={14} />
                          </p>
                          <p className="mt-3 text-2xs text-ink-400">
                            Updated {formatDate(article.updated)}
                          </p>
                        </Link>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </Container>
      </Section>
    </>
  );
}

function categoryHeading(category: string): string {
  switch (category) {
    case "Basics":
      return "Start here";
    case "Heirs and estates":
      return "When the owner has died";
    case "Jurisdictions":
      return "How local rules work";
    case "Avoiding harm":
      return "Protecting yourself";
    default:
      return category;
  }
}
