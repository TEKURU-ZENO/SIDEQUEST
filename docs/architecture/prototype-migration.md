# Prototype migration matrix

The source of truth for the initial browser implementation is commit `fe255c9` and tag `prototype-v1`. Root prototype files are retained until migrated equivalents pass behavior checks.

| Prototype asset                                                       | Destination                                                                 | Acceptance check                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Command center markup and visual styling (`index.html`, `styles.css`) | `apps/dashboard` React features and CSS                                     | Responsive dashboard renders the same quest, party, activity, encounter, memory and roadmap regions |
| Static OBS composition (`overlay.html`)                               | `apps/overlay` React scene                                                  | Transparent scene shows quest status, objectives, community count and chat prompts                  |
| Chat action handler                                                   | `packages/twitch` normalizer plus `packages/application` command path       | Chat input maps to validated commands; unknown inputs are ignored and invalid transitions rejected  |
| Encounter resolution and vitality updates                             | `packages/domain`                                                           | Identical input sequence yields identical events and outcome; prior state remains immutable         |
| Role selection and local viewers                                      | domain player model and testing fixtures                                    | Four roles can join; cap and contribution rules enforced server side                                |
| World memory display                                                  | dashboard presentation over historical event context / intelligence summary | Distinguish persisted history from derived summary; no claimed AI behavior in demo mode             |
| Sample quests and chat events                                         | `packages/testing` fixtures and intelligence fallback                       | Demo works with no credentials or network keys                                                      |
| Demo adapter                                                          | dashboard -> API -> application -> domain                                   | Same commands and state machine later receive Twitch normalized events                              |

Current behavior deviations to resolve before deleting the prototype: old demo seeded eight viewers and three feed rows; new domain starts an empty party and the dashboard currently seeds one world-memory note. The old UI resolves before or after launch with a browser-local score; the new domain requires an active quest and joined players. UI details remain as close as practical while domain rules become explicit.
