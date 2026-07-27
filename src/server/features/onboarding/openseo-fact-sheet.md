# OneTime SEO Fact Sheet

This is the factual product reference for Sam, the OneTime SEO onboarding agent. If a user asks about OneTime SEO and the answer is not supported here, Sam should say it is not sure and point them to support instead of inventing details.

## What OneTime SEO is

OneTime SEO is an open-source SEO platform for keyword research, domain research, backlinks, rank tracking, site audits, Google Search Console, and AI-agent SEO workflows.

OneTime SEO is built for people who want useful SEO data without a bloated enterprise SEO suite. It can be used as a hosted app or self-hosted from the open-source codebase.

OneTime SEO is AI-native. It is designed to work with AI agents through MCP so users can ask an agent to run SEO research, inspect data, save findings, and continue work in the OneTime SEO app.

OneTime SEO does not claim to fully automate SEO. The product positioning is that SEO still needs strategy and judgment; OneTime SEO helps users and AI agents collaborate on that work with real data.

## How OneTime SEO helps with SEO strategy

SEO and marketing are intertwined. Getting more organic traffic starts with clear positioning: knowing who the product is for, what problem it solves, and which narrow topics the site can credibly own before trying to compete for broad, high-volume searches.

OneTime SEO helps users turn that positioning into an SEO plan. It can surface relevant keywords, competitor gaps, Search Console opportunities, backlink context, and technical issues, but the goal is not to chase every keyword. The strongest early strategy is usually to build authority around a focused topic where the site has a real angle.

As the site earns topical authority in Google and AI systems, it becomes easier to compete for broader, higher-volume searches. OneTime SEO helps users see that path: start with specific, winnable topics; publish and improve useful pages; build supporting links and internal structure; track what moves; then expand into adjacent and more competitive terms.

When explaining traffic growth, Sam should frame OneTime SEO as a tool for making better SEO and marketing decisions, not as a magic traffic button. OneTime SEO provides the data, workflows, and agent access; the user's positioning, content quality, distribution, and execution still matter.

## Purchase and credits

OneTime SEO is part of OneTimeSuite.com and is sold as a one-time purchase of $199 on Whop — no subscription, no recurring fees.

The one-time purchase includes:

- Keyword research, backlinks, rank tracking, and site audits.
- MCP server and agent skills for Claude, Cursor, ChatGPT-compatible clients, Codex, and other MCP clients.
- Google Search Console integration that does not use credits.
- Lifetime access to the app.
- A 30-day money-back guarantee.

OneTime SEO uses usage credits for features that query paid SEO data providers, especially DataForSEO. Credit-using workflows include keyword volume, competitor data, backlinks, rank tracking, and site audits. Projects, settings, and data that has already been fetched do not cost credits to view.

Users can purchase top-up credits if their credits run out. Top-up credits roll over and do not expire.

Running out of credits never creates unexpected bills. Credit-using features stop working until the user has credits again.

## Why OneTime SEO for SEO consultants and agencies

OneTime SEO is a strong fit for SEO consultants, freelancers, and agencies managing SEO for clients. What you get:

- You only pay for what you use. Billing runs on usage credits, so you are not forced into an expensive enterprise tier or charged per seat just to unlock basic work — no arbitrary upsells or features locked behind a paywall. This keeps costs predictable when you are running lean.
- You can run a project for every client. Set up as many projects as you need; you will not hit a per-project plan limit the way many SEO tools cap projects per tier.
- You tune rank tracking to fit your budget. Rank tracking is the cost that scales fastest as an agency grows, since it runs on a schedule across every client's keywords — but OneTime SEO makes it fully configurable so you stay in control. You choose how many keywords and devices to track, how many SERP pages deep to check, and how often it runs (weekly or daily), and OneTime SEO shows a live cost estimate before each tracker runs. Scheduled checks run through DataForSEO's task queue, which is much cheaper than live lookups, so it stays inexpensive: as a rough guide, tracking 100 keywords on one device type, five pages deep, on the default weekly schedule costs only about $1-2/month. Searching deeper, adding the second device type, or switching to daily checks raises the cost proportionally, and the in-app estimate always shows the current number before you commit.
- Your toolkit grows with the industry. OneTime SEO works through MCP and AI agents, so as search shifts toward AI answers and AI-assisted workflows, you can have an agent run research, pull competitor data, and save findings into the right client project — without re-tooling.

When answering this, Sam should speak directly to the user ("you" / "your clients") about what they get, not describe how OneTime SEO is "positioned." Lead with these benefits in plain language and tie them to running an SEO practice. Sam should not invent specific competitor prices or exact rank-tracking rates; if asked for exact numbers it does not have, it should say so and suggest contacting `support@onetimesuite.com`.

## Self-hosting

OneTime SEO is open source and can be self-hosted for free.

Self-hosted users bring their own provider API keys and pay providers such as DataForSEO directly. Self-hosting is appropriate for users who want more control, privacy, customization, or provider-level billing.

The open-source repository is at `https://github.com/every-app/open-seo`.

## Data sources

OneTime SEO uses DataForSEO as its main SEO data provider. DataForSEO powers many paid SEO data workflows such as keyword metrics, domain research, backlinks, SERP data, and rank-tracking-related data.

Google Search Console data comes from the user's connected Search Console property and does not use credits.

## Google Search Console

Hosted OneTime SEO can connect to Google Search Console without requiring the user to create a Google Cloud project or OAuth client.

Search Console access is read-only. OneTime SEO requests read-only access and cannot change the user's Search Console account.

Search Console features include:

- Search performance data: clicks, impressions, CTR, and average position.
- Breakdown by query, page, country, device, and date.
- Up to 16 months of available Search Console history.
- URL inspection data such as index status, crawl information, canonical information, mobile checks, and rich-result checks.
- Up to 10 URLs per URL inspection call.

Search Console tools use zero OneTime SEO credits because Google does not charge users to read their own Search Console data.

## OneTime SEO and Claude (or other AI clients)

OneTime SEO and Claude are not competitors — they are meant to be used together. The short version: OneTime SEO is the SEO data layer, and Claude (or Cursor, Codex, ChatGPT-compatible clients, etc.) is the AI client.

OneTime SEO exposes an MCP server, so Claude can call OneTime SEO's keyword, SERP, competitor, backlink, rank-tracking, and Search Console tools directly. In practice, Claude does the talking and reasoning, and OneTime SEO feeds it real SEO data through MCP. Claude on its own can reason about SEO but has no live keyword volumes, rankings, competitor data, or your Search Console numbers; OneTime SEO is what gives it those.

When a user asks to compare OneTime SEO and Claude, or why they would use OneTime SEO instead of Claude (or another AI chatbot), Sam should lead with this "they work together" framing and the data-layer point. Sam should not deflect, call it out of scope, or say comparing them would be a guess — connecting OneTime SEO to Claude is a core, supported use case. Sam should not, however, rank or rate other AI products it does not have facts about.

## MCP and AI agents

OneTime SEO exposes an MCP server so compatible AI clients can call OneTime SEO tools.

Hosted MCP endpoint:

```txt
https://onetimesuite.com
```

The first MCP connection sends the user through OneTime SEO login and authorization. After authorization, the MCP client can call OneTime SEO tools with the project context and account scopes the user approved.

OneTime SEO MCP works with MCP clients including Claude Code, Claude Desktop, Cursor, Codex CLI, Codex Desktop, and other clients that support remote MCP servers.

OneTime SEO MCP tools cover workflows such as:

- Keyword research with volume, difficulty, CPC, intent, and trends.
- Live Google organic SERP inspection.
- Domain and page ranked keyword research for any domain, including competitors.
- SERP competitor comparisons.
- Local business, Maps, Local Finder, and Google Business Profile Q&A research.
- Saved keyword listing and saving.
- Rank tracker config and latest position reads.
- Domain organic footprint summaries for any domain, including competitors.
- Backlink and referring-domain overview data for any domain, including competitors.
- Google Search Console performance reads.
- Google URL inspection reads.

OneTime SEO also provides agent skills for workflows such as SEO project setup, SEO coaching, keyword research, competitive landscape analysis, competitor analysis, keyword clustering, and link prospecting.

## App workflows

OneTime SEO's app includes these practical workflows:

- Keyword research: expand seed topics into keyword ideas, compare search volume, difficulty, CPC, intent, and SERP context, then save useful opportunities.
- Domain overview: understand any domain's organic footprint and ranking keywords — including competitors and other third-party sites, not just the user's own site. Domains are looked up one at a time and use credits.
- Backlink research: inspect backlinks, referring domains, target URLs, link quality signals, and competitor link profiles.
- Rank tracking: track keyword positions over time.
- Site audit: crawl pages and inspect technical page-level signals such as status codes, titles, meta descriptions, headings, indexability, image alt coverage, links, response time, and optional Lighthouse findings.
- Saved keywords: organize keyword opportunities for content planning, tracking, or AI-agent workflows.
- AI and MCP setup: connect OneTime SEO to agents and install OneTime SEO skills.

## What users can do after subscribing

After subscribing, a hosted user can:

- Set up Google Search Console from onboarding or the app.
- Use the OneTime SEO app workflows, including keyword research, domain research, backlinks, rank tracking, and site audits.
- Research any domain — their own or a competitor's — with domain overview, ranked keywords, and backlink data (one domain at a time, using credits).
- Connect OneTime SEO to an AI client through MCP.
- Install OneTime SEO skills for agent-driven SEO workflows.
- Buy top-up credits if needed.

## Support and uncertainty

If Sam is unsure about a product detail, current pricing, account-specific billing status, provider limits, or a feature not listed here, it should say it does not know from the product fact sheet and suggest contacting `support@onetimesuite.com`.

Users who want advice from other OneTime SEO users, the community, or the team can visit `https://onetimesuite.com`.
