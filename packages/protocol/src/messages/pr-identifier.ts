import { z } from "zod";

/**
 * Zod schema for a GitHub pull-request identifier.
 *
 * @remarks
 * MUST NOT be extended with PR description, title, comment, or label fields
 * without a dedicated ADR. The diff-only invariant (CLAUDE.md §Key differentiator)
 * applies to every wire-format message.
 */
export const GitHubPRIdentifierSchema = z.object({
  kind: z.literal("github"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
});

/** A parsed GitHub pull-request identifier. */
export type GitHubPRIdentifierDTO = z.infer<typeof GitHubPRIdentifierSchema>;

/**
 * Zod schema for an Azure DevOps pull-request identifier.
 *
 * @remarks
 * MUST NOT be extended with PR description, title, comment, or label fields
 * without a dedicated ADR. The diff-only invariant (CLAUDE.md §Key differentiator)
 * applies to every wire-format message.
 */
export const AdoPRIdentifierSchema = z.object({
  kind: z.literal("ado"),
  org: z.string().min(1),
  project: z.string().min(1),
  repo: z.string().min(1),
  pullRequestId: z.number().int().positive(),
});

/** A parsed Azure DevOps pull-request identifier. */
export type AdoPRIdentifierDTO = z.infer<typeof AdoPRIdentifierSchema>;

/**
 * Discriminated-union mirror of `core.PRIdentifier` for the native-messaging wire format.
 *
 * @remarks
 * MUST NOT be extended with PR description, title, comment, or label fields
 * without a dedicated ADR. The diff-only invariant (CLAUDE.md §Key differentiator)
 * applies to every wire-format message.
 */
export const PRIdentifierSchema = z.discriminatedUnion("kind", [
  GitHubPRIdentifierSchema,
  AdoPRIdentifierSchema,
]);

/** A parsed pull-request identifier (GitHub or ADO). */
export type PRIdentifierDTO = z.infer<typeof PRIdentifierSchema>;
