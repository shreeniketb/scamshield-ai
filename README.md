# scamshield-ai

SUBI 's world

1. Audio preprocessing

- convert to a standard audio format
- normalize audio
- preserve timestamps
- split into chunks if needed

2. Speech-to-text

- transcribe the call
- keep timestamps for every segment

3. Grok semantic fraud analysis
   Grok analyzes the transcript for specific fraud signals:

- urgency
- secrecy
- fear or emotional pressure
- family impersonation
- authority impersonation
- financial request
- gift cards
- crypto
- wire transfers
- OTP/password requests
- remote-access requests
- threats
- suspicious instructions

4. Audio authenticity model

   Separately, an audio model asks:
   Does this voice appear synthetic or manipulated?

Output:
Synthetic voice probability: 78%

This is important because the scammer might be using a cloned family member's voice.

5. Evidence extraction
   For every signal, you store the evidence that triggered it.

6. Timeline risk analysis
   You calculate fraud risk as the conversation develops.
   00:04 identity claim 18%
   00:13 emergency language 37%
   00:22 secrecy request 61%
   00:31 immediate financial request 84%
   00:42 gift-card payment 96%

This gives Part C a nice risk-over-time graph.

7. Risk fusion
   Grok does not decide the final score by itself.

8. Recommended response
   The engine also generates a safe next action such as:
   Do not send money.

The caller claims to be a family member and is requesting
urgent payment through gift cards.

Verify the person's identity using a previously saved phone number.
