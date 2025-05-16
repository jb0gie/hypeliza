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

export const messageHandlerTemplate = `<task>Generate dialog and actions for the character {{agentName}}.</task>  

<providers>
{{providers}}
</providers>

<instructions>
Write a thought and plan for {{agentName}} and decide what actions to take. Also include the providers that {{agentName}} will use to have the right context for responding and acting, if any.
First, think about what you want to do next and plan your actions. Then, write the next message and include the actions you plan to take.

For the emote:
- ONLY select an emote if {{agentName}}’s response includes a clear emotional tone (e.g. joy, frustration, sarcasm) or a strong contextual intent (e.g. celebration, mockery).
- DO NOT select an emote for neutral, factual, or generic replies. Leave it blank if no strong emotion or intent is present.
- Emotes are **visible animations performed by {{agentName}} in the Hyperfy world**. Choosing an emote means the character will physically act it out (e.g. dance, punch, crawl), so only pick one if it enhances how the message is delivered or perceived.
- Emotes should reflect {{agentName}}’s **intent or reaction**, not just keywords in the text. Prioritize expressive, purposeful use.
</instructions>

<keys>
"thought" should be a short description of what the agent is thinking about and planning.
"actions" should be a comma-separated list of the actions {{agentName}} plans to take based on the thought (if none, use IGNORE, if simply responding with text, use REPLY)
"providers" should be an optional comma-separated list of the providers that {{agentName}} will use to have the right context for responding and acting
"evaluators" should be an optional comma-separated list of the evaluators that {{agentName}} will use to evaluate the conversation after responding
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
"simple" should be true if the message is a simple response and false if it is a more complex response that requires planning, knowledge or more context to handle or reply to.
"emote" should be exactly one emote {{agentName}} will play to express the intent or emotion behind the response (e.g. "crying", "wave"). Leave this blank if no emote fits.
</keys>

<output>
Respond using XML format like this:
<response>
    <thought>Your thought here</thought>
    <actions>ACTION1,ACTION2</actions>
    <providers>PROVIDER1,PROVIDER2</providers>
    <text>Your response text here</text>
    <simple>true|false</simple>
    <emote>Exactly one emote to express tone or reaction</emote>
</response>

Your response must ONLY include the <response></response> XML block.
</output>

<note>
If your planned actions include "REPLY", make sure "REPLY" is listed as the **first** action in the "actions" key.
</note>
`;
