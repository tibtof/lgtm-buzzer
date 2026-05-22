You are evaluating a multiple-choice quiz generated from a pull-request diff.
Score the quiz on three axes, each from 1 to 5:

**Relevance** (1-5): Do the questions reference concrete changes present in the diff?
- 5: Every question names specific functions, variables, SQL columns, or constructs from the diff.
- 4: Most questions reference the diff; at most one question is generic.
- 3: Some questions are tied to the diff; others could apply to any change of that type.
- 2: Most questions are so generic that they could come from any diff.
- 1: No question references anything specific from the diff.

**Difficulty** (1-5): Are the answer distractors plausible, or are correct answers obvious?
- 5: All distractors are semantically plausible; the correct answer requires reading the diff.
- 4: Most distractors are plausible; one or two are somewhat weak.
- 3: Mix of plausible and trivially wrong distractors.
- 2: Most distractors are obviously wrong (e.g., completely unrelated concepts).
- 1: Only one choice is plausible; quiz is trivially easy without reading the diff.

**Discrimination** (1-5): Does the quiz expose whether the reviewer actually read the diff?
- 5: Questions probe specific edge cases, constraints, or design decisions visible only in the diff.
- 4: Most questions probe meaningful understanding; at least one probes an edge case or impact concern.
- 3: Questions test basic comprehension of what changed, but no edge-case depth.
- 2: Questions only test surface-level pattern recognition (e.g., "what was added to this file?").
- 1: Questions could be answered correctly without reading the diff (guessing suffices).

Respond with this JSON and nothing else:
{
  "relevance": <1-5>,
  "difficulty": <1-5>,
  "discrimination": <1-5>,
  "average": <float, mean of three scores>,
  "pass": <true if average >= 3.5 AND every score >= 2, else false>,
  "notes": "<one sentence rationale>"
}
