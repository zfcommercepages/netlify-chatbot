# Agent trigger with context


## Changes in Agent Builder

AGENT_WEBHOOK_URL -> This webhook url is used to trigger a AI Agent that i built
I have made changes to how the agent reacts to webhook... now i want to make changes in this repo too

What i have changed

1. I have made the agent webhook handling to be asyncronous
The Agent will provide the response with a poll url and stream url

The response structure is 

```json
{
  "received": true,
  "mode": "agent",
  "sync": false,
  "run_id": "efaab9ab-3c19-4a1b-89c7-c391be2fd7ca",
  "status": "pending",
  "poll_url": "/agents/builder/runs/detail/efaab9ab-3c19-4a1b-89c7-c391be2fd7ca",
  "stream_url": "/agents/builder/runs/efaab9ab-3c19-4a1b-89c7-c391be2fd7ca/stream",
  "message": "Agent run created and executing in the background. Poll the poll_url for status or connect to stream_url for real-time updates."
}
```

2. The agent is stateless it does not maintain any state about the conversation, it just provides the response based on the user prompt and the context provided in the webhook payload. So i have removed the conversation id from the payload and replaced it with a unique run id that is generated for each agent run.

## Your Task

1. You need to make changes such that the agent trigger async logic is handled
2. You need to poll the poll url 10s after triggering the agent and check for the status of the agent run
3. You can use the local storage to store the poll_url. Once the agent run is completed you can remove the poll_url from the local storage
4. Get the agent response from the stream url and display it once the agent has completed the run.
5. Display the agent reponse in the chat as agent reponse.
6. As the agent cannot maintain context have a JSONArray with JSON object with two nodes.
7. One node must contain the user prompt and the other node must contain the agent response. You can use this JSONArray to maintain the context of the conversation and pass it to the agent in the webhook payload for each subsequent user prompt. You can limit the size of this JSONArray to 5 entries to avoid exceeding token limits.
8. Maintain the context in local storage
9. When loading widget check if there is any context in local storage and load it into the conversation context