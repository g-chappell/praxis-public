# NNNN — <Title>

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNNN

## Context

What problem are we solving? What constraints are in play (technical, time,
team, external)? Half a paragraph to half a page. If this ADR contradicts
earlier docs, name them — e.g. "supersedes guidance in `docs/project_plan.md`
§3."

## Decision

What we are doing. Be specific: name the tool, the boundary, the API. If
the decision is "we'll pick X over Y," put that in the title and use the
body to explain *why X*, not "what is X."

## Consequences

What becomes easier, what becomes harder, what is now true. Include the
follow-up work the decision creates ("we now have to maintain Z"), the
reversibility cost ("swapping requires an ADR + an N-day migration"), and
any obvious second-order effects.

## Alternatives considered

What else we looked at, briefly. One line per alternative explaining why
it lost — usually because of a constraint listed in Context. Don't
re-justify the winner here; the Decision section did that.

---

<!--
ADR conventions (from AGENTS.md):

- Numbered sequentially: 0001-, 0002-, ...
- Half a page is enough. ADRs are a forcing function for one decision,
  not a design doc.
- Written when a decision crosses component boundaries, introduces a new
  external dependency, or chooses between non-obvious alternatives.
- Read by both humans and agents working on the code. Don't bury the lede.
- Status `Accepted` is the default when a decision is in force.
  `Deprecated` means we no longer recommend it but old code still uses it.
  `Superseded by ADR-NNNN` means a newer ADR replaces this one — leave
  this ADR in place for the audit trail.
-->
