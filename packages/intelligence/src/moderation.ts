import OpenAI from "openai";

export type ModerationResult = {
  allowed: boolean;
  reason?: string;
};

/** Moderates text before it can become public world or overlay content. */
export async function moderatePublicText(
  apiKey: string | undefined,
  text: string,
): Promise<ModerationResult> {
  const bounded = text.slice(0, 4_000);
  // Do not silently accept unmoderated audience content in live paths.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(bounded))
    return { allowed: false, reason: "control-characters" };
  if (!apiKey) return { allowed: false, reason: "moderation-unconfigured" };

  try {
    const client = new OpenAI({ apiKey });
    const result = await client.moderations.create({
      model: "omni-moderation-latest",
      input: bounded,
    });
    const decision = result.results[0];
    return decision?.flagged
      ? { allowed: false, reason: "provider-flagged" }
      : { allowed: true };
  } catch {
    // Fail closed for untrusted viewer content. Callers use authored fallback
    // text for generated content when moderation is unavailable.
    return { allowed: false, reason: "moderation-unavailable" };
  }
}
