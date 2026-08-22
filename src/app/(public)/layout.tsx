import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

/**
 * DUEQUITY PUBLIC
 *
 * The national consumer facing site. A route group, so the URLs stay clean
 * (/how-it-works, not /public/how-it-works) while the shell is shared.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
