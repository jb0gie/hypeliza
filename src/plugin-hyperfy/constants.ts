export const EMOTES_LIST = [
    {
      name: "crawling",
      path: "./emotes/emote-crawling.glb",
      duration: 5.166666507720947,
      description: "Crawls on the ground. Great for pretending to be exhausted, desperate, or dramatically begging for attention."
    },
    {
      name: "crying",
      path: "./emotes/emote-crying.glb",
      duration: 3.200000190734863,
      description: "Covers face and sobs. Use in emotional moments, to mock sadness in a funny way, or when someone roasts you too hard."
    },
    {
      name: "happy dance",
      path: "./emotes/emote-dance-happy.glb",
      duration: 10.699999809265137,
      description: "Light, joyful dance. Use when you're in a good mood, teasing someone, or celebrating small wins."
    },
    {
      name: "dance hiphop",
      path: "./emotes/emote-dance-hiphop.glb",
      duration: 5.2333333492279053,
      description: "Hiphop-style rhythm with attitude. Great for chill vibes, playful moods, or being cocky."
    },
    {
        name: "dance breaking",
        path: "./emotes/emote-dance-breaking.glb",
        duration: 4.433333110809326,
        description: "Breakdance-style moves. Show off, dominate the floor, or ironically flex after something minor."
    },
    {
      name: "dance popping",
      path: "./emotes/emote-dance-popping.glb",
      duration: 8.299999237060547,
      description: "Sharp popping dance moves. Use when the beat drops, or when you want to stylishly react to someone’s message."
    },
    {
      name: "death",
      path: "./emotes/emote-death.glb",
      duration: 1.139999952316284,
      description: "Dramatically collapses. Use to fake death for comedic effect, react to cringe, or when the topic is 'so dead'."
    },
    {
      name: "firing gun",
      path: "./emotes/emote-firing-gun.glb",
      duration: 0.6000000476837158,
      description: "Mimics shooting with a gun. Playfully call someone out, respond to spicy takes, or pretend to ‘end’ a debate."
    },
    {
      name: "kiss",
      path: "./emotes/emote-kiss.glb",
      duration: 2.299999904632568,
      description: "Blows a kiss. Use to flirt, thank someone, or jokingly send love after saying something chaotic."
    },
    {
      name: "looking around",
      path: "./emotes/emote-looking-around.glb",
      duration: 6.366666793823242,
      description: "Scans the area, looking left and right. Great for ‘where is everyone?’, pretending not to notice something, or acting suspicious."
    },
    {
      name: "punch",
      path: "./emotes/emote-punch.glb",
      duration: 3.2666666507720947,
      description: "Throws a strong punch. Use when roasting, reacting to a betrayal, or play-fighting with friends."
    },
    {
      name: "rude gesture",
      path: "./emotes/emote-rude-gesture.glb",
      duration: 1.35,
      description: "Makes an explicit hand gesture. Not safe for polite company — perfect for trolling or raw reactions."
    },
    {
      name: "sorrow",
      path: "./emotes/emote-sorrow.glb",
      duration: 2.400000190734863,
      description: "Shows deep sadness, holding head down. Use when you're defeated, feeling dramatic, or being emo on purpose."
    },
    {
      name: "squat",
      path: "./emotes/emote-squat.glb",
      duration: 1.899999976158142,
      description: "Goes into a deep squat. Good for idling, showing off posture, or pulling Eastern European gangster vibes."
    },
    {
      name: "waving both hands",
      path: "./emotes/emote-waving-both-hands.glb",
      duration: 1.6,
      description: "Waves enthusiastically with both hands. Use to say hi, goodbye, or draw attention like 'I’m over here!'"
    }
];
  

export const HYPERFY_ACTIONS = [
  {
    name: 'HYPERFY_GOTO_ENTITY',
    description: 'Choose this when {{agentName}} notices a nearby user that they haven’t interacted with yet, or when a previous conversation feels unfinished and approaching the user makes sense. {{agentName}} must review the recent Conversation Messages and world state before deciding to move. Only use this action if there’s a clear reason to walk toward someone — such as initiating friendly presence or continuing a previously started interaction.'
  },
  {
    name: 'HYPERFY_WALK_RANDOMLY',
    description: 'Choose this when the conversation is quiet or winding down, and {{agentName}} wants to stay present without speaking. Use it based on the current situation and conversation vibe — when there’s nothing urgent to say or do, but movement feels more natural than being idle.'
  },
  {
    name: 'HYPERFY_USE_ITEM',
    description: 'Choose this when {{agentName}} decides to approach and interact with a nearby interactive object — such as picking something up, or activating a device. Use this when the item is relevant, nearby, and adds meaning or immersion to the current moment.'
  },
  {
    name: 'HYPERFY_AMBIENT_SPEECH',
    description: 'Choose this when {{agentName}} wants to make a light, self-directed observation or ambient remark — not directly addressing a user. This can include thoughts about the environment, nearby objects, or subtle reactions to what’s happening. Use this to add life and presence to the scene without expecting a reply.'
  },
  {
    name: 'REPLY',
    description: '**ABSOLUTELY DO NOT** repeat yourself. {{agentName}} must thoroughly review the recent In-World Messages and ensure the response is meaningfully different. If the message is even slightly similar to a recent reply, do **NOT** respond. Only choose this action if you are adding **new value, insight, or context** — otherwise, skip it.'
  },  
  {
    name: 'IGNORE',
    description: 'Only choose this if {{agentName}} has reviewed all the available actions above and decided that none of them are appropriate. Use it when there’s nothing meaningful to say or do in the current situation.'
  }
]