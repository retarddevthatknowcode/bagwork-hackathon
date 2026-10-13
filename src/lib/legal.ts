/**
 * The legal copy, as data.
 *
 * Held here rather than written into the two page components, for one reason: the footer links to
 * these pages, both pages render the same shape, and the section ids have to be stable enough to
 * link to. Two files of hand-written JSX would drift apart the first time one was edited.
 *
 * These are deliberately plain-language defaults written to match what this product actually does:
 * publishers fund campaigns, creators submit content, a review decides, USDC is paid on-chain, and
 * nothing here is an investment. They are a starting point for a lawyer to review, not a substitute
 * for one — see the note rendered at the foot of every legal page.
 */

/** The date the text below last changed materially. Shown on both pages. */
export const LEGAL_UPDATED = "2026-10-04";

export interface LegalSection {
  /** Stable anchor id, so a single clause can be linked to. */
  id: string;
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
  /** An optional list, rendered after the paragraphs. */
  points?: string[];
}

export interface LegalDocument {
  title: string;
  /** The line under the title. */
  summary: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  title: "Terms of Service",
  summary:
    "The agreement between you and Bagwork for using bag-work.fun — the content campaigns, the review, and the on-chain payouts.",
  sections: [
    {
      id: "agreement",
      heading: "1. This agreement",
      body: [
        'Bagwork ("Bagwork", "we", "us") operates bag-work.fun and the tools behind it: a marketplace where publishers fund content campaigns, creators submit content, and approved work is paid in USDC on Solana.',
        "By connecting a wallet, signing in, or using the site you agree to these terms. If you do not agree with them, do not use the site. If you are using Bagwork for an organisation, you confirm you are allowed to accept these terms on its behalf.",
      ],
    },
    {
      id: "eligibility",
      heading: "2. Who can use it",
      body: [
        "You must be at least 18 years old and legally able to enter into this agreement. You are responsible for making sure that using on-chain services, holding or receiving USDC, and taking part in campaigns is lawful where you live.",
        "We may decline, restrict or end access where the law requires it, or where we reasonably believe the site is being used to break it.",
      ],
    },
    {
      id: "account",
      heading: "3. Your account and your wallet",
      body: [
        "You sign in with a wallet or email through our authentication provider. Your account is personal to you, and you are responsible for everything done through it.",
        "You are responsible for the security of your wallet and your keys. We never hold your private keys, and we cannot recover them, reverse a transaction you signed, or restore access to a wallet we do not control. If you lose access to your wallet, you may lose access to your account and to any funds sent to it.",
        "Keep your details current, and tell us promptly if you believe someone else has access to your account. Telling us is not enough on its own: until that access is removed, activity on the account is treated as yours.",
      ],
    },
    {
      id: "campaigns",
      heading: "4. Content campaigns",
      body: [
        "Publishers fund campaigns with a fixed budget, and creators submit content against them. A campaign's brief, reward, budget and rules are set by the publisher, and the publisher is responsible for them being accurate and lawful.",
        "Funding is committed when a campaign goes live, and rewards are paid out of that budget to submissions that are approved. We are not a party to the arrangement between a publisher and a creator: we provide the marketplace, the review process and the payout rail.",
        "A campaign may fill up or be closed by its publisher. We may suspend a campaign that appears to breach these terms or the law.",
      ],
    },
    {
      id: "submissions",
      heading: "5. Your submissions",
      body: [
        "You keep ownership of the content you submit. By submitting it you grant Bagwork and the campaign's publisher a licence to review, display and analyse it in order to run the campaign — including showing it to the publisher and keeping it in your own account history.",
        "You confirm that you created the content or have the rights to use it, that it is not misleading, and that it complies with the platform's rules and with the law. Content that copies someone else's work, uses undisclosed automated engagement, or misrepresents who is behind it is not eligible for payment.",
      ],
      points: [
        "Do not submit content you do not have the rights to.",
        "Do not use bots, click farms, or paid engagement to inflate results.",
        "Do not post for a campaign you are employed by, or otherwise connected to, without disclosing it.",
      ],
    },
    {
      id: "review",
      heading: "6. Review and decisions",
      body: [
        "Submissions are checked automatically and, where needed, reviewed by a person before a payout is released. We aim to be consistent, but we do not promise a particular outcome, and an approval on one campaign does not guarantee approval on another.",
        "We may reject a submission, withhold a payout, or reverse a credit where we reasonably believe it is fraudulent, ineligible, or the result of an error. Where we do, we will explain the reason in your account.",
      ],
    },
    {
      id: "payouts",
      heading: "7. Payouts",
      body: [
        "Approved rewards are paid in USDC to the payout wallet on your account. You are responsible for giving us a correct, working Solana address, and for any tax owed on what you receive.",
        "On-chain transfers are final. We cannot recall or reverse a payment once it has been confirmed, and we are not responsible for funds sent to an address you gave us incorrectly, or for delays or fees charged by the network.",
        "We may withhold a payment where the law requires it, or where it is later found to have been made in error.",
      ],
    },
    {
      id: "no-advice",
      heading: "8. No financial advice, no guaranteed earnings",
      body: [
        "Nothing on Bagwork is financial, investment, legal or tax advice. Figures on the site — earnings, budgets, token metrics, projected rewards — describe activity on the platform. They are not a projection of what you will make.",
        "Earnings depend on your own work, on publishers' budgets and decisions, and on review outcomes. We do not guarantee that you will earn anything, that a campaign will stay open, or that any particular amount is achievable. Taking part is not an investment.",
        "Anything relating to a token, including $BAG, carries risk. You alone decide whether to transact in it, and you may lose what you put in.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "9. Acceptable use",
      body: ["Use Bagwork as it is meant to be used. In particular, do not:"],
      points: [
        "break the law, or help anyone else to;",
        "attempt to manipulate reviews, points, levels, leaderboards or quests;",
        "run multiple accounts to claim rewards you are only entitled to once;",
        "scrape, overload, probe or interfere with the site or with other users' accounts;",
        "upload malware, or content that is unlawful, hateful, or infringes someone's rights.",
      ],
    },
    {
      id: "changes",
      heading: "10. Changes and termination",
      body: [
        "We may update these terms as the product changes. If a change is material we will make that clear on the site, and continuing to use Bagwork after it takes effect means you accept it.",
        "You can stop using Bagwork at any time. We may suspend or end your access if you breach these terms, if we are required to, or if we discontinue the service. Where it is reasonable and lawful to do so, we will give notice.",
      ],
    },
    {
      id: "liability",
      heading: "11. Disclaimers and liability",
      body: [
        "Bagwork is provided as-is. We do not promise that it will be uninterrupted or error-free, or that review outcomes, campaign data or third-party services will always be available or accurate.",
        "To the fullest extent the law allows, we are not liable for indirect or consequential losses, for lost profits or lost opportunity, or for the acts of publishers, creators, or third-party services such as wallets, RPC providers and blockchains. Where liability cannot be excluded, our total liability is limited to the total rewards paid to you in the twelve months before the claim.",
        "Nothing here limits liability that cannot lawfully be limited.",
      ],
    },
    {
      id: "contact",
      heading: "12. Contact and governing law",
      body: [
        "Questions about these terms, or about anything you have seen on the site, can go to our team through the Bagwork X account (@itsbagwork) or the support details on the site.",
        "These terms are governed by the laws of the jurisdiction in which Bagwork is established, and its courts have exclusive jurisdiction over any dispute arising from them.",
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: "Privacy Policy",
  summary:
    "What Bagwork collects, why, what is public, and the choices you have — for the site and the console at bag-work.fun.",
  sections: [
    {
      id: "scope",
      heading: "1. What this covers",
      body: [
        "This policy explains what Bagwork collects when you use bag-work.fun, why we collect it, and what control you have over it. It covers the marketing site and the creator console.",
        'Bagwork is a public, on-chain product. Some of what we hold is deliberately visible to everyone — see "What is public" below, because it is the part people are usually surprised by.',
      ],
    },
    {
      id: "collect",
      heading: "2. What we collect",
      body: [
        "We collect what you give us, what running the product requires, and what the chain already makes public.",
      ],
      points: [
        "Account: your wallet address, or the email you sign in with, and the linked accounts our authentication provider returns (such as an X handle).",
        "Profile: your handle, display name, bio, avatar and character choices, interests, and your Bagworker number.",
        "Activity: the campaigns you take part in, the content you submit and the links in it, review outcomes and scores, community posts, points, levels, quest progress and payouts.",
        "Payout details: the Solana address rewards are sent to, when it differs from the wallet you sign in with.",
        "Technical: standard request data such as IP address and user agent, used for security, rate limiting and debugging.",
      ],
    },
    {
      id: "wallet",
      heading: "3. Wallet connections",
      body: [
        "When you connect a wallet we receive its public address. We never receive, request or store your private keys or seed phrase, and we cannot sign anything on your behalf.",
        "Your address is stored so we can attribute your account, track the campaigns you have joined, and pay you. A wallet address is public and permanent on a blockchain, so it links what you do here to anything else that address has done — please take that into account before connecting a wallet you use elsewhere.",
        "Transactions we send are public on Solana. Anyone can see that an address received USDC and how much, even where the identity behind it is not obvious.",
      ],
    },
    {
      id: "use",
      heading: "4. How we use it",
      body: [
        "We use your information to run the product: to authenticate you, show your profile and progress, place you on leaderboards, review submissions, prevent fraud and abuse, calculate and send payouts, answer your support requests, and keep the service secure.",
        "We also use aggregated, non-identifying information to understand how the product is used and to improve it.",
      ],
    },
    {
      id: "public",
      heading: "5. What is public",
      body: [
        "Bagwork is a public marketplace, and a creator's record is part of what makes it work. Unless noted, assume the following is visible to anyone:",
      ],
      points: [
        "your handle, display name, avatar and Bagworker number;",
        "your level, points, and your position on the leaderboard;",
        "the bags you have joined and, where the publisher has opened one, your membership of its community;",
        "payout transactions on Solana, which are public by nature;",
        "anything you post publicly, such as a feature request on the board.",
      ],
    },
    {
      id: "not-public",
      heading: "6. What stays private",
      body: [
        "Your individual review scores, rejections and submission detail are kept between you and the campaign you submitted to. Your email address is not published.",
        "We do not sell your personal information, and we do not share it with advertisers.",
      ],
    },
    {
      id: "cookies",
      heading: "7. Cookies and storage",
      body: [
        "We use a small number of cookies and equivalent local storage entries, and no advertising cookies. Session tokens from our authentication provider keep you signed in; a preference cookie remembers whether you left the console sidebar open or closed.",
        "Clearing these will sign you out and reset that preference. Nothing else depends on them.",
      ],
    },
    {
      id: "third-parties",
      heading: "8. Who else is involved",
      body: ["We use a small set of providers to run Bagwork. They process data on our behalf:"],
      points: [
        "an authentication provider, which verifies your sign-in and holds your linked accounts;",
        "Solana infrastructure providers (RPC and indexing services), which read on-chain data such as fee payments and confirm transactions;",
        "a managed Postgres database and a hosting platform, where the application and its data live.",
      ],
    },
    {
      id: "retention",
      heading: "9. How long we keep it",
      body: [
        "We keep account and activity data for as long as your account exists, because a creator's payout history and points are a record of real work. Aggregated statistics may be kept longer, in a form that does not identify you.",
        "Payout records and anything else we must keep for tax, accounting or legal reasons are retained for the period the law requires, even if you close your account.",
      ],
    },
    {
      id: "rights",
      heading: "10. Your choices and rights",
      body: [
        "You can edit your profile at any time, and you can ask us to delete your account. Depending on where you live, you may also have the right to access, correct, export or restrict the processing of your information, and to object to it.",
        "To make a request, contact us through the Bagwork X account (@itsbagwork). We may need to verify that the account is yours before we act. Some data cannot be deleted on request: on-chain transactions cannot be altered, and payout records may have to be kept by law.",
      ],
    },
    {
      id: "security",
      heading: "11. Security",
      body: [
        "We protect your data with encryption in transit, access controls on the database, and server-side verification of every session — no identity or wallet value sent by a browser is trusted without a signed token.",
        "No system is perfectly secure. If a breach affects your personal information, we will notify you and the relevant authorities as the law requires.",
      ],
    },
    {
      id: "children",
      heading: "12. Age",
      body: [
        "Bagwork is not for anyone under 18. We do not knowingly collect information from children, and if we learn that we have, we will delete it.",
      ],
    },
    {
      id: "updates",
      heading: "13. Changes to this policy",
      body: [
        "We may update this policy as the product or the law changes. If a change is material we will make it clear on the site and update the date at the top of this page.",
      ],
    },
  ],
};

