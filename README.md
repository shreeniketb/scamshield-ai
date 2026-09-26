# scamshield-ai

### Compartment 1: Audio normalization

This is the first layer.
Responsibility
Take whatever audio Part A gives you and convert it into something all downstream models understand.
Tasks

- convert to WAV if necessary
- 16 kHz sampling rate
- mono audio
- normalize amplitude
- preserve duration and timestamps
- optionally chunk long audio

Input

incoming_call.wav

or another audio format.

Output

normalized_audio.wav
duration = 48.7 seconds
sample_rate = 16000

This module should not perform fraud detection.

### Compartment 2: Synthetic voice detection

This is the NSA HEARSAY component.
Responsibility
Determine:
Does this audio appear to be genuine human speech or synthetic/cloned speech?

Model
Something like:

```

Audio
↓
WavLM / HuBERT / wav2vec
↓
Classifier
↓
P(synthetic)

```

Potentially ensemble it with:
Spectrogram → CNN

Output
For the hackathon app:

```

{
"synthetic_probability": 0.87,
"classification": "likely_synthetic"
}

```

For the NSA competition:
filename score

```

audio_001.wav 0.87
audio_002.wav 0.03

```

This should remain a standalone module because you need to evaluate it separately using the NSA minDCF metric.

### Compartment 3: Speech-to-text

Responsibility
Turn the call into text while keeping timestamps.
Use Whisper or another ASR system.
Input
normalized_audio.wav

```
Output
[
{
"start": 1.2,
"end": 4.7,
"text": "Grandma, it's me."
},
{
"start": 5.1,
"end": 10.3,
"text": "I've been arrested."
},
{
"start": 10.8,
"end": 14.1,
"text": "Please don't tell Mom."
}
]
```

This becomes the input for Grok.

### Compartment 4: Grok semantic scam analysis

This is where Grok becomes useful.
The question Grok answers is not:
Is this synthetic?

The audio model handles that.
Grok answers:
What scam behavior is happening in this conversation?

Detect

- urgency
- secrecy
- financial request
- emotional pressure
- fear
- authority impersonation
- family impersonation
- bank impersonation
- government impersonation
- credential request
- OTP request
- gift cards
- cryptocurrency
- wire transfer
- remote-access request
- threats
  Extract
- claimed identity
- organization
- requested amount
- currency
- payment method
- requested action
- deadline
- target/victim
- scam type
  Example output

```
  {
  "scam_type": "family_impersonation",
  "scam_type_confidence": 0.92,

  "signals": {
  "urgency": 0.94,
  "secrecy": 0.97,
  "financial_request": 0.99,
  "family_impersonation": 0.89
  },

  "entities": {
  "claimed_identity": "grandson",
  "requested_amount": 2000,
  "currency": "USD",
  "payment_method": "gift_cards"
  }
  }
```

### Compartment 5: Evidence extraction

This is critical for Part C.
Don't just return:
secrecy = 97%

Return why.
Example

```
{
"signal": "secrecy",
"confidence": 0.97,
"evidence": "Please don't tell Mom.",
"start": 10.8,
"end": 14.1
}
```

Another:

```
{
"signal": "financial_request",
"confidence": 0.99,
"evidence": "I need you to send me $2,000 right now.",
"start": 22.1,
"end": 27.4
}
```

This lets the dashboard highlight exact moments.

### Compartment 6: Timeline analysis

Build risk through the conversation.
For every segment:

```
timestamp
↓
detected behavior
↓
risk contribution

Example:
00:03
"Grandma, it's me."
Identity claim
Risk: 18%

00:12
"I've been arrested."
Emergency/fear
Risk: 41%

00:19
"Don't tell Mom."
Secrecy
Risk: 66%

00:29
"Send me $2,000."
Financial pressure
Risk: 85%

00:37
"Buy gift cards."
Suspicious payment
Risk: 96%
```

This gives your dashboard a very nice risk-over-time visualization.

### Compartment 7: Risk fusion

This combines the audio model and semantic model.
You do not want Grok to arbitrarily invent one final probability.
Instead:
Synthetic speech score

- Impersonation
- Urgency
- Secrecy
- Financial request
- Suspicious payment
- Credential request
  ↓
  Final risk

Conceptually:
\[
R = w_vV + w_iI + w_uU + w_sS + w_fF + w_pP
\]
Where:

- \(V\) = synthetic voice probability
- \(I\) = impersonation
- \(U\) = urgency
- \(S\) = secrecy
- \(F\) = financial request
- \(P\) = suspicious payment
  For the hackathon, weights can initially be manually chosen and later tuned.

### Compartment 8: Recommended action

Part B should also tell Part C what action is appropriate.
For example:
{
"recommended_action": "Verify the caller using a previously saved phone number before sending money."
}

Possible actions:

- verify caller independently
- do not send money
- do not provide OTP
- call trusted family member
- contact bank
- end call and call official number
- do not install remote-access software
  Compartment 9: Unified result builder
  Every module should ultimately feed one object.
  Your teammates should not have to individually call 6 different models.
  They should call:
  result = analyze_call(audio_file)

And receive one structured result.

```

```
