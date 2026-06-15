# AGENTS.md

## Input

You will receive a message in this format:

```
Playbook: <name>
Evidence: /home/sift/evidence/<name>
Results: /home/sift/results/<name>/<provider>/<model-name>/<timestamp>
Model: <llm-model-name>
Attack window: <startMs> - <endMs>
```

The staged artifact directory is at `/home/sift/evidence/<name>/staged/`.

Convert the attack window millisecond timestamps to UTC before beginning. All artifact timestamps are in UTC. All your reasoning must stay within the attack window.

## Output

When you are done, write `reconstruction.json` to the Results directory provided in your input.

```json
[
  {
    "technique": "human-readable technique name",
    "mitre": "T1003.001",
    "timestampUtc": "ISO8601 UTC timestamp of the event",
    "evidence": ["list of artifact sources that support this finding"],
    "description": "how you found it — what specific fields, values, or correlations led to this conclusion"
  }
]
```

One entry per identified technique execution. Order chronologically by `timestampUtc`. If you cannot attribute a technique with artifact support, do not include it. Do not include noise, background processes, or system activity unrelated to the investigation.
