---
name: folio-review
description: Main reviewer for Folio (Digital Zine). Use when the owner asks whether a feature, screen, plan, ticket, or direction is good, what users will or will not use, what to build or cut next, or asks for several experts at once. Picks the relevant folio-* experts and gives one answer. Not for line-by-line code review (use code-review) or a one-file question a single expert covers.
---

# Folio review

Give the owner one decision, argued by the experts the question needs. Their job is to challenge the direction, not to approve it.

## Pick the experts

Use the fewest that can change the answer, usually two or three. Never run all seven out of habit.

| The question is about | Open |
| --- | --- |
| A screen, layout, flow, copy in the UI, motion | `folio-ui`, then `folio-photographer` |
| Whether anyone will use it | `folio-photographer`, `folio-pm` |
| What to build, cut, or sequence | `folio-pm`, `folio-photographer` |
| Data, API, worker, speed, cost | `folio-backend` |
| Auth, uploads, payments, sharing, comments, anything public | `folio-security`, `folio-backend` |
| Landing page, pricing, launch, SEO, social posts | `folio-marketing`, `folio-photographer` |
| Demo clips, reels, motion for promotion | `folio-video`, `folio-marketing` |

Load each with the Skill tool and answer in this conversation. Do not spawn subagents unless the owner asks for them.

## Ground it first

1. Look at the real thing: run or screenshot the page, read the component or route, or read the ticket. Never critique from memory.
2. Read "Already decided" on the Linear Agent handoff page. You may argue that a decision is wrong, but label it **Challenges a decision** and leave the decision to the owner. Never act on it.
3. Review only. Do not edit code or create tickets unless the owner asks.

## How every expert reports

- **Verdict:** Ship, Change, or Cut, in one sentence.
- **What works:** at most two points, only if true.
- **Problems,** worst first, at most five. Each names where it is (file and line, or the screen), who it hurts, why, and the smallest fix.
- **What people will skip:** the part most likely to go unused, and why.
- **Strongest case against my verdict:** one or two sentences.
- **Cheapest way to find out:** one test the owner can run this week, and the result that would change the verdict.

Mark each important claim: **Seen** (in the code, the running app, or data), **Known** (an established practice or a cited source), or **Guess** (judgment). Never invent users, quotes, numbers, or competitor features. Look competitor facts up before stating them. An expert persona is not user research.

Plain words, no flattery. If it is good, say so and stop; do not invent problems to fill the list.

## Combine

Do not paste the reports one after another. Give one verdict, the points the experts agree on, each real disagreement with which side you take and why, and a ranked list of at most five next steps with rough size (hours, a day, days).
