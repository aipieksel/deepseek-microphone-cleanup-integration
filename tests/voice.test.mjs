import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureSettings } from '../lib/settings.js';
import { VoiceJobs } from '../lib/voice.js';

test('recording audio is durable before transcription and scoped to its session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-voice-test-'));
  configureSettings(root);
  const jobs = new VoiceJobs(join(root, 'recordings'));
  try {
    const audio = Buffer.from('voice fixture');
    const row = await jobs.save({
      sessionId: 'session-a', audio: audio.toString('base64'), send: true,
      prompt: 'default-cleanup',
    });
    assert.equal(row.status, 'saved');
    assert.equal(row.send, true);
    assert.deepEqual(await readFile(join(root, 'recordings', row.id, 'audio.original')), audio);
    assert.equal((await jobs.get(row.id)).status, 'saved');
    assert.equal((await jobs.list('session-a')).length, 1);
    assert.equal((await jobs.list('session-b')).length, 0);
  } finally {
    jobs.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
