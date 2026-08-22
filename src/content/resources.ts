/**
 * RESOURCE ARTICLES
 *
 * Editorial content for the public site. This is Duequity's own published
 * writing, not operational data: no article describes a real claimant, property,
 * case or recovery, and nothing here is derived from a persisted record.
 *
 * Kept as structured data rather than MDX so no additional dependency or build
 * step is needed for a handful of articles. If the library grows past a dozen
 * pieces, a content source is the right move.
 *
 * Editorial rules:
 *   - never judgemental about how someone lost a property
 *   - no fear, no urgency, no pressure
 *   - explain the mechanism, do not sell the service
 */

export interface ResourceArticle {
  slug: string;
  title: string;
  summary: string;
  category: "Basics" | "Heirs and estates" | "Jurisdictions" | "Avoiding harm";
  readingMinutes: number;
  updated: string;
  /** Paragraphs and headings, rendered in order. */
  body: (
    | { kind: "h2"; text: string }
    | { kind: "p"; text: string }
    | { kind: "ul"; items: string[] }
  )[];
}

export const RESOURCE_ARTICLES: ResourceArticle[] = [
  {
    slug: "what-are-surplus-funds",
    title: "What surplus funds are, and who they belong to",
    summary:
      "A property sale settles a debt. When it raises more than the debt, the remainder is surplus. Here is where it goes and who is usually entitled to it.",
    category: "Basics",
    readingMinutes: 5,
    updated: "2026-07-14",
    body: [
      {
        kind: "p",
        text: "When a property is sold at a foreclosure or tax sale, the sale exists to satisfy a debt. The lender is owed a specific amount, the county may be owed taxes, and there are statutory costs of conducting the sale. Those are paid from the proceeds in a priority order set by law.",
      },
      {
        kind: "p",
        text: "Sometimes the sale raises more than all of that. A property with a small remaining mortgage balance, or one sold in a strong market, can produce proceeds well above what was owed. The amount left over after every valid claim is satisfied is the surplus.",
      },
      {
        kind: "p",
        text: "The surplus does not belong to the lender, who has been paid what it was owed. It does not belong to the buyer, who paid the price they bid. It does not belong to the county or the court, which is holding it. In most cases it belongs to the person who owned the property before the sale, or if that person has died, to their heirs.",
      },
      { kind: "h2", text: "Who holds the money" },
      {
        kind: "p",
        text: "This varies by state and by the type of sale, which is one reason surplus claims are harder than they sound. Depending on the jurisdiction, funds may sit with:",
      },
      {
        kind: "ul",
        items: [
          "The clerk of the court that oversaw a judicial foreclosure",
          "The county treasurer or tax collector after a tax sale",
          "The sheriff who conducted the sale",
          "A trustee who conducted a nonjudicial foreclosure",
          "The state unclaimed property office, if the holding period has lapsed",
        ],
      },
      {
        kind: "p",
        text: "Each of these has its own procedure, its own forms, and its own deadline. A claim filed with the wrong office is not usually forwarded to the right one.",
      },
      { kind: "h2", text: "Why liens matter so much" },
      {
        kind: "p",
        text: "A surplus is not simply the sale price minus the mortgage. Other recorded interests can be paid from the surplus before the former owner receives anything: a second mortgage, a home equity line, a judgment lien, a federal or state tax lien, an HOA lien, or a child support lien.",
      },
      {
        kind: "p",
        text: "This is why an estimate calculated from a published sale list can be badly wrong. A sale that appears to leave a large surplus may leave nothing once a second mortgage is accounted for. It is also why a figure confirmed by the agency in writing is worth much more than a figure anyone has calculated, including us.",
      },
      { kind: "h2", text: "What happens if nobody claims it" },
      {
        kind: "p",
        text: "Every jurisdiction sets a window. It may be one year, two years, three years, or longer. When the window closes, the funds generally escheat to the state, which means the state takes custody of them. In some states the money can still be claimed from the unclaimed property office afterwards, and in others the opportunity is gone.",
      },
      {
        kind: "p",
        text: "Agencies do publish notices, and some make genuine efforts to locate former owners. But nobody is obliged to find someone who has moved, and notices are frequently mailed to the address of the property that was just sold.",
      },
    ],
  },
  {
    slug: "surplus-funds-when-the-owner-has-died",
    title: "When the property owner has died",
    summary:
      "Heirs can often claim a surplus, but most jurisdictions require an estate to be opened first. What that means, and what a family typically needs.",
    category: "Heirs and estates",
    readingMinutes: 6,
    updated: "2026-07-28",
    body: [
      {
        kind: "p",
        text: "If the person who owned a property has died, the right to claim a surplus does not disappear. It passes to their estate, and through the estate to their heirs or beneficiaries. What changes is the process, which becomes considerably more involved.",
      },
      {
        kind: "p",
        text: "This is the situation families most often find impossible to navigate alone, not because it is conceptually difficult, but because it requires steps in a specific order through a court most people have never dealt with.",
      },
      { kind: "h2", text: "Why an estate usually has to be opened" },
      {
        kind: "p",
        text: "A court or county will not typically hand money to someone who says they are a decedent's child. It needs a legally recognised person with authority to receive assets on behalf of the estate. That authority comes from the probate court, in a document usually called letters of administration or letters testamentary.",
      },
      {
        kind: "p",
        text: "Opening an estate means filing a petition in the county where the decedent lived, identifying the heirs, and asking the court to appoint a personal representative. Where the surplus is modest, many states offer a simplified small estate procedure that is faster and cheaper. Whether that route is available depends on the total value of the estate and the state's threshold.",
      },
      { kind: "h2", text: "What a family typically needs" },
      {
        kind: "ul",
        items: [
          "A certified copy of the death certificate, with a raised seal, not an informational copy",
          "The recorded deed showing the decedent owned the property",
          "An affidavit of heirship identifying every heir at law",
          "Identification for each heir who will be involved in the claim",
          "A will or trust instrument, if one exists",
          "Letters of administration or testamentary from the probate court",
        ],
      },
      { kind: "h2", text: "When there are several heirs" },
      {
        kind: "p",
        text: "If a decedent had three children and no will, each child typically holds an equal share of whatever the estate receives. Many agencies will not disburse a partial share, which means the claim needs all the heirs to be identified and, usually, to consent.",
      },
      {
        kind: "p",
        text: "That is straightforward when a family is in contact and agrees. It becomes difficult when an heir cannot be located, has died themselves leaving their own heirs, or does not want to participate. There are legal mechanisms for each of these, including notice by publication and court processes that address an absent heir's interest, and they generally require an attorney.",
      },
      { kind: "h2", text: "A note on cost and timing" },
      {
        kind: "p",
        text: "Opening an estate has real costs: court filing fees, the certified documents, and attorney fees where counsel is required. Timing runs from a few weeks for a small estate procedure to several months or longer for a full administration.",
      },
      {
        kind: "p",
        text: "Those costs need to be weighed against the surplus. A family should know the likely total before starting, and anyone who advises otherwise is not giving them the information they need to decide.",
      },
    ],
  },
  {
    slug: "why-surplus-rules-differ-by-county",
    title: "Why the rules differ from one county to the next",
    summary:
      "There is no national surplus system. The type of sale, the office holding the funds, and the state statute all change what a claim requires.",
    category: "Jurisdictions",
    readingMinutes: 5,
    updated: "2026-06-30",
    body: [
      {
        kind: "p",
        text: "People reasonably assume there is one process for claiming surplus funds. There is not. Surplus procedure is set by state law, shaped by local court practice, and administered by whichever office happens to be holding the money. The result is genuine variation between neighbouring counties in the same state.",
      },
      { kind: "h2", text: "Judicial and nonjudicial foreclosure" },
      {
        kind: "p",
        text: "In a judicial foreclosure state, a lender must go through court to foreclose. A court supervises the sale, an auditor or similar officer accounts for the proceeds, and the surplus is usually held by the clerk of that court. The claim is often made within the existing case.",
      },
      {
        kind: "p",
        text: "In a nonjudicial state, a trustee can conduct the sale under a power of sale in the deed of trust without a court. The trustee accounts for the proceeds and may hold the surplus, deposit it with a court, or send it to the state. The claim procedure follows whichever of those happened.",
      },
      { kind: "h2", text: "Tax sales are a separate system again" },
      {
        kind: "p",
        text: "A tax sale is not a mortgage foreclosure. It arises from unpaid property taxes, and depending on the state it may be a tax lien sale, a tax certificate sale, or a tax deed sale. Priority rules differ, and in some states a recorded mortgage is paid out of the surplus ahead of the former owner while in others it is not.",
      },
      { kind: "h2", text: "What changes between jurisdictions" },
      {
        kind: "ul",
        items: [
          "Which office holds the funds and which form it requires",
          "How long the claim window stays open, from months to years",
          "Whether a claim is administrative or requires a petition to a court",
          "Whether an attorney must file the claim",
          "Whether a power of attorney is accepted",
          "Whether a surplus claim may be sold or assigned, which many states prohibit",
          "What a recovery service may charge, and whether it must be licensed or bonded",
          "What is required when the owner has died",
        ],
      },
      { kind: "h2", text: "Why this matters when choosing help" },
      {
        kind: "p",
        text: "Because the rules vary this much, a service operating nationally has to know the rules of each county it works in, or it will eventually charge a fee a state does not permit, file a claim in the wrong office, or sign a claimant in a state where it is not licensed to act.",
      },
      {
        kind: "p",
        text: "It is fair to ask any service which specific office holds your funds, what the statutory deadline is, what their fee ceiling is in your jurisdiction, and whether they are licensed where licensing is required. A service that cannot answer those quickly is not working from a recorded rule set.",
      },
    ],
  },
  {
    slug: "how-to-spot-a-surplus-funds-scam",
    title: "How to tell a legitimate approach from a scam",
    summary:
      "Surplus recovery attracts predatory operators. The specific warning signs, and how to verify any approach independently.",
    category: "Avoiding harm",
    readingMinutes: 6,
    updated: "2026-08-04",
    body: [
      {
        kind: "p",
        text: "Public records make it easy to identify who lost a property and roughly what it sold for. That means anyone who has been through a foreclosure or tax sale becomes a target for a mix of legitimate services, aggressive operators, and outright fraud.",
      },
      {
        kind: "p",
        text: "If you have received one of these approaches, treating it with suspicion is the correct response. Here is how to sort them out.",
      },
      { kind: "h2", text: "Signs that something is wrong" },
      {
        kind: "ul",
        items: [
          "Any request for payment before money has been recovered: a fee, a deposit, a filing cost, a gift card, or a wire",
          "A request for your Social Security number or bank details in a first contact",
          "A claim or implication of being from a court, county, or government office",
          "Pressure to sign immediately, or a claim that the opportunity expires within days",
          "Refusal to tell you which agency holds the funds",
          "A guarantee that you will receive a specific amount",
          "An offer to buy your claim, or paperwork that assigns your rights rather than representing you",
          "Unwillingness to put the fee in writing before you commit",
          "A fee that seems disconnected from the work, particularly a large percentage in a state that caps it",
        ],
      },
      { kind: "h2", text: "The assignment problem" },
      {
        kind: "p",
        text: "This one deserves particular attention because it does not look like fraud. Some operators do not offer to help you claim your money. They offer to buy your claim, often for a fraction of its value, paid immediately.",
      },
      {
        kind: "p",
        text: "For someone in financial difficulty an immediate payment is genuinely attractive, which is what makes the practice effective. But signing over a forty thousand dollar claim for five thousand dollars is not a service. Several states prohibit the assignment of a surplus claim for exactly this reason. If the paperwork transfers your rights rather than authorising someone to act for you, stop and get independent advice.",
      },
      { kind: "h2", text: "How to verify anything independently" },
      {
        kind: "ul",
        items: [
          "Look up the case number yourself in the court or county records the approach cites",
          "Call the agency named and ask directly whether surplus funds are held for that property",
          "Search the company name together with the words complaint and licence",
          "Check whether your state requires a locator to be licensed or bonded, and whether the company is",
          "Contact the company through the details on its own published website rather than replying to the message you received",
          "Ask a local attorney to look at any agreement before you sign it",
        ],
      },
      { kind: "h2", text: "The most important thing to know" },
      {
        kind: "p",
        text: "In most jurisdictions you can claim a surplus yourself, directly from the agency, at no cost. You may still choose to use a service because the process is unfamiliar, the documents are hard to obtain, or the estate situation is complicated. Those are legitimate reasons.",
      },
      {
        kind: "p",
        text: "But you should be making that choice knowing the free option exists. Any service that does not tell you about it has already told you something important about how it operates.",
      },
    ],
  },
];

export function getArticle(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((a) => a.slug === slug);
}
