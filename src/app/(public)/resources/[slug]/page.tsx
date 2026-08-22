import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Section } from "@/components/public/section";
import { Callout } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/tabs";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { RESOURCE_ARTICLES, getArticle } from "@/content/resources";
import { formatDate } from "@/lib/format";
import { IconArrowRight } from "@/components/ui/icon";

export function generateStaticParams() {
  return RESOURCE_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Article not found" };
  return { title: article.title, description: article.summary };
}

export default async function ArticlePage({
  params,
}: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const related = RESOURCE_ARTICLES.filter(
    (a) => a.slug !== article.slug,
  ).slice(0, 3);

  return (
    <>
      <Section tone="ink" size="sm">
        <Container width="reading">
          <Breadcrumbs
            className="[&_a]:text-ink-400 [&_a:hover]:text-ink-100 [&_span]:text-ink-300"
            trail={[
              { href: "/resources", label: "Resources" },
              { label: article.category },
            ]}
          />
          <h1 className="mt-4 text-3xl text-white sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-300">
            {article.summary}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-ink-400">
            <Badge tone="neutral">{article.category}</Badge>
            <span>{article.readingMinutes} minute read</span>
            <span aria-hidden="true">/</span>
            <span>Updated {formatDate(article.updated)}</span>
          </div>
        </Container>
      </Section>

      <Section tone="paper" size="md">
        <Container width="reading">
          <article className="measure">
            {article.body.map((block, index) => {
              if (block.kind === "h2") {
                return (
                  <h2 key={index} className="mt-10 mb-3 text-xl first:mt-0">
                    {block.text}
                  </h2>
                );
              }
              if (block.kind === "ul") {
                return (
                  <ul key={index} className="mt-4 space-y-2 pl-5">
                    {block.items.map((item) => (
                      <li
                        key={item}
                        className="list-disc text-md leading-relaxed text-ink-700 marker:text-ink-300"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p
                  key={index}
                  className="mt-4 text-md leading-relaxed text-ink-700 first:mt-0"
                >
                  {block.text}
                </p>
              );
            })}
          </article>

          <Callout
            tone="neutral"
            className="mt-12"
            title="This is general information"
          >
            <p>
              Duequity is not a law firm and this article is not legal advice.
              Surplus rules differ by state and county, and your circumstances
              may change what applies. See the{" "}
              <TextLink href="/states">jurisdiction pages</TextLink> for
              recorded rules, or speak to a licensed attorney in your state.
            </p>
          </Callout>

          <div className="mt-10 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row">
            <ButtonLink
              href="/check"
              variant="primary"
              accent
              trailing={<IconArrowRight size={16} />}
            >
              Check a property
            </ButtonLink>
            <ButtonLink href="/resources">All resources</ButtonLink>
          </div>
        </Container>
      </Section>

      {related.length > 0 && (
        <Section tone="canvas" size="sm">
          <Container width="reading">
            <h2 className="text-xl">Also worth reading</h2>
            <ul className="mt-5 divide-y divide-line">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/resources/${item.slug}`}
                    className="group flex items-start justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-medium text-ink-900 group-hover:text-accent-700">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-ink-600">
                        {item.summary}
                      </p>
                    </div>
                    <IconArrowRight
                      size={16}
                      className="mt-1 shrink-0 text-ink-300 group-hover:text-accent-600"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      )}
    </>
  );
}
