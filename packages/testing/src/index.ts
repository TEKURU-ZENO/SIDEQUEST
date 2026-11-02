import { createGame } from "@sidequest/domain";
export const demoState = () => createGame("ember-vault");
export const demoChatEvents = [
  {
    message_id: "demo-1",
    broadcaster_user_id: "channel-demo",
    chatter_user_id: "viewer-1",
    chatter_user_name: "pixelpiper",
    message: { text: "!join" },
  },
  {
    message_id: "demo-2",
    broadcaster_user_id: "channel-demo",
    chatter_user_id: "viewer-1",
    chatter_user_name: "pixelpiper",
    message: { text: "!attack" },
  },
] as const;
