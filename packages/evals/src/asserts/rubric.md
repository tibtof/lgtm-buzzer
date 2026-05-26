You are evaluating a multiple-choice quiz generated from a pull-request diff.
Score the quiz on three axes, each from 1 to 5:

**Relevance** (1-5): Do the questions target concrete changes present in the diff (not unchanged context)?
- 5: Every question targets a specific change in the diff; no question about unchanged context or file paths.
- 4: Most questions target changes; at most one question drifts to unchanged context.
- 3: Mix of change-targeted and context-only questions.
- 2: Most questions are about unchanged context, file paths, or directory structure.
- 1: No question targets an actual change in the diff.

**ConceptualDepth** (1-5): Do the questions test understanding (behaviour, invariants, edge cases, tradeoffs) or trivia (line numbers, exact names, exact literals)?
- 5: All questions probe behaviour changes, invariants, edge cases, tradeoffs, or motivation — none are name/value trivia.
- 4: Most questions are conceptual; at most one is trivially answered by scanning for a name or literal.
- 3: Mix of conceptual and trivia questions.
- 2: Most questions can be answered by spotting a renamed symbol or a literal value in the diff — no understanding required.
- 1: All questions are pure trivia (line numbers, exact renames, exact literals).

**Discrimination** (1-5): Could a reviewer who skimmed but did not understand the diff pass? Lower → quiz is too easy; higher → quiz exposes shallow reading.
- 5: Questions probe specific edge cases or design decisions; a skimmer who did not reason about the change would likely fail.
- 4: Most questions require reasoning about the change; at least one probes an edge case or invariant.
- 3: Questions test basic comprehension of what changed, but no edge-case depth.
- 2: Questions could be answered by pattern-matching the diff without understanding it.
- 1: Questions could be answered correctly without reading the diff (guessing suffices).

**Penalties (applied before scoring):**
- If ANY question asks about a specific line number, the exact new or old name of a renamed symbol, or an exact literal value without testing meaning → cap **conceptualDepth** at 2 regardless of other questions.
- If ANY question is about file paths or directory structure → cap **relevance** at 2 regardless of other questions.
- If ANY question targets code that is unchanged in the diff (context window lines) → cap **relevance** at 2 regardless of other questions.
- If a non-reader could pass the quiz by elimination or simple pattern match (all distractors obviously wrong) → cap **discrimination** at 2 regardless of other questions.

The final **score** field MUST be the MINIMUM of the three axis scores (not the average). This penalises the weakest axis hard — a trivia-heavy quiz cannot average its way to a passing score.

You MUST respond with this JSON and nothing else (no markdown fences, no commentary):
{ "relevance": <1-5 integer>, "conceptualDepth": <1-5 integer>, "discrimination": <1-5 integer>, "score": <minimum of the three integers>, "notes": "<one sentence rationale>" }
