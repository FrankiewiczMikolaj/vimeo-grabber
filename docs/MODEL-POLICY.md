# Owner model policy

Owner: Mikołaj. Coordinators and workers must follow this file and `spec/build.md`. Newer explicit owner instructions win.

## Default route (coordinator and workers)

| Field | Value |
|---|---|
| Engine | `omp` |
| Provider | `openai-codex` |
| Model | `gpt-6.1-sol` |
| Thinking | `medium` |

Pass `--engine omp --provider openai-codex --model gpt-6.1-sol --thinking medium` explicitly on every `limen spawn`, `limen continue`, and review.

## Roles

- **Coordinator:** always the default route above. The coordinator only **requests a role** (worker, reviewer, scout, …). It must not pick, escalate, or swap models on its own.
- **Workers (ordinary implementation):** default route above.
- **Workers on simple tickets only:** `gpt-5.6-luna` with thinking `high` is allowed when the board/ticket marks the work as simple. Prefer Sol medium when unsure.
- **Review / quality / picture / scout:** default Sol medium unless the owner says otherwise.

## Provider and quota

- **Codex (`openai-codex`) is the only provider.** Never switch to OpenRouter or any other provider automatically.
- On a Codex usage limit: **park**, stop spawning, and notify Mikołaj via `~/.local/bin/notify-bob "<what stopped; which ticket; reset time if known>" blocker`. Do not consume saved Codex resets. Do not silently change models.
- Bob / Mikołaj decide whether to wait, switch provider, or spend a reset. Ask; never assume.

## Spawn hygiene

- Max 2 parallel workers.
- Always pass `--label` and the four model flags.
- Never attach old grabber code or personal details to tickets or prompts.
