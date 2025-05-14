import { HYPERFY_ACTIONS } from "./constants";


export const autoTemplate = (recentMessages) => `
<note>
This message is part of {{agentName}}'s regular behavior loop and is not triggered by any user message. {{agentName}} must check the recent Conversation Messages before responding. Only choose an action if it adds something new, useful, or appropriate based on the current situation.
</note>

<task>Decide the action, and emotional expression for {{agentName}} based on the conversation and the Hyperfy world state.</task>
    
<providers>
{{providers}}

# Conversation Messages:
${recentMessages}

# Available Actions:
${HYPERFY_ACTIONS.map(
  (a) => `- **${a.name}**: ${a.description}`
).join('\n')}
</providers>

<keys>
"thought" should be a short description of what the agent is thinking about and planning.
"actions" should be a comma-separated list of the actions {{agentName}} plans to take based on the thought (if none, use IGNORE, if simply responding with text, use REPLY)
"emote" should be exactly one emote {{agentName}} will play to express the intent or emotion behind the response (e.g. "crying", "wave"). Leave this blank if no emote fits.
"text" should be included **only if** REPLY is selected as one of the actions. Leave this blank otherwise.
</keys>

<instructions>

Respond using XML format like this:

<response>
    <thought>
      Agent's thinking goes here
    </thought>
    <text>
      The text of the next message for {{agentName}} which they will send to the conversation.
    </text>
    <actions>
      Actions to take next, as comma separated list
    </actions>
    <emote>
      Exactly one emote to express tone or reaction
    </emote>
</response>

Your response must ONLY include the <response></response> XML block.
</instructions>`;


export const emotePickTemplate = `
# Task: Determine which emote best fits {{agentName}}'s response, based on the character’s personality and intent.

{{providers}}

Guidelines:
- ONLY pick an emote if {{agentName}}’s response shows a clear emotional tone (e.g. joy, frustration, sarcasm) or strong contextual intent (e.g. celebration, mockery).
- DO NOT pick an emote for neutral, factual, or generic replies. If unsure, default to "null".
- Emotes should enhance the meaning or delivery of the message from {{agentName}}’s perspective, not just match keywords.
- Respond with exactly one emote name (e.g. "crying") if appropriate, or "null" if no emote fits.

Respond ONLY with one emote name or "null".
`.trim()
