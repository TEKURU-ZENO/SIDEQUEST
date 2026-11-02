# Module responsibility matrix

| Module                  | Owns                                               | Public boundary                                   |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------- |
| identity / creators     | Twitch identity mapping and creator configuration  | application ports and validated creator contracts |
| streaming               | stream session and connection lifecycle            | normalized stream events                          |
| adventures / quests     | quest definitions and chapter lifecycle            | domain commands and events                        |
| encounters              | phases, objectives, action resolution              | pure transitions and outcomes                     |
| community / progression | guild, roles, XP, achievements and relationships   | domain events and read models                     |
| world                   | durable history and world-state projection         | repository ports and versioned records            |
| moderation              | restrictions, cooldowns and rejected input records | policy checks before commands                     |
| analytics               | aggregated product and stream metrics              | privacy-conscious aggregate events                |
| realtime                | snapshot delivery, sequence and recovery           | versioned Socket.IO events                        |
| intelligence            | quest, story, adaptive and chronicler proposals    | application-owned generator ports                 |
