import { describe, it, expectTypeOf } from "vitest";
import type { IO } from "monadyssey";
import type { Diff, GenerateQuizInput, LLMProvider } from "./llm-provider.js";
import type { LLMProviderError } from "../quiz/errors.js";
import type { Quiz } from "../quiz/quiz.js";

describe("LLMProvider port — type-only smoke", () => {
  it("GenerateQuizInput has exactly diff and questionCount", () => {
    expectTypeOf<GenerateQuizInput>().toMatchTypeOf<{
      readonly diff: Diff;
      readonly questionCount: number;
    }>();
  });

  it("Diff is a string alias", () => {
    // Updated by ADR-12: Diff is now branded.
    expectTypeOf<Diff>().toMatchTypeOf<string>();
  });

  it("LLMProvider id is string and generateQuiz is a function", () => {
    expectTypeOf<LLMProvider>().toMatchTypeOf<{
      readonly id: string;
      readonly generateQuiz: (input: GenerateQuizInput) => IO<LLMProviderError, Quiz>;
    }>();
  });

  it("a noop fake satisfies the LLMProvider port type", () => {
    // Constructing a fake at the type level verifies the port shape compiles.
    // The function body is never invoked — this is a compile-time smoke test.
    const _fake: LLMProvider = {
      id: "noop",
      generateQuiz: (_input: GenerateQuizInput): IO<LLMProviderError, Quiz> => {  // eslint-disable-line @typescript-eslint/no-unused-vars
        // IO is type-only in this file (per ADR-11 §Decision 6 carve-out).
        // Returning a never-resolving value satisfies the return type at
        // compile time without requiring a runtime IO constructor.
        return undefined as never;
      },
    };
    // Asserts the fake was assigned without a type error.
    expectTypeOf(_fake.id).toBeString();
  });
});
