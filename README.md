# DeepSeek Harness microphone and cleanup integration

This Node package contains the Agents Pro dictation pipeline for DeepSeek
Harness: saved audio, MLX Whisper transcription, Codex or Grok CLI cleanup,
recording recovery, phrase detection, and persistent recording settings. The
launcher plugin keeps the native Harness microphone, broom, Settings, and
delivery controls. It uses this package for server-side work; it does not
replace Harness's native UI.

## Install and use

Clone this repository beside
[`deepseek-codex-grok-cli-integration`](https://github.com/aipieksel/deepseek-codex-grok-cli-integration)
and [`deepseek-project-specific-harness-launcher`](https://github.com/aipieksel/deepseek-project-specific-harness-launcher).
Run `script/install-integrations.sh` in the launcher checkout. The microphone
requires browser permission, local `ffmpeg`, Python with `mlx_whisper`, and a
configured local speech model. Cleanup uses an already signed-in Codex or Grok
CLI via the sibling integration.

Run `npm install --ignore-scripts` and `npm test` from this directory; `npm pack
--dry-run` lists shipped files. Saved audio and text live under the user's
Agents Pro state directory and are never part of this repository. Dictation
processing begins after audio is saved; a failed transcription can be retried
from Saved recordings in the host UI. The UI's queue and captured-cursor
behavior remains owned by the launcher plugin.

## Rights

Original code in this repository is licensed under the [MIT License](LICENSE).
DeepSeek Harness, Codex, Grok, and MLX Whisper retain their owners' separate
rights; their runtimes, models, and credentials are not included here. This is
an independent local integration.
