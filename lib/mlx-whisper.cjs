'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// Keep source bytes while this module is alive, even if VS Code removes the
// installed extension folder during an update. This does not load the model.
const workerSource = fs.readFileSync(path.join(__dirname, 'mlx-whisper-worker.py'));
const workerHash = crypto.createHash('sha256').update(workerSource).digest('hex');

function cachedWorker(directory) {
  const file = path.join(directory, `mlx-whisper-worker-${workerHash}.py`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(file) && fs.readFileSync(file).equals(workerSource)) return file;
  const temporary = file + `.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, workerSource, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return file;
}

// One serialized, warm worker per extension host. Aborting kills GPU inference;
// the next request restarts it. No automatic send or audio deletion occurs here.
function createMlxWhisper({ python, model, workerDirectory = path.join(os.tmpdir(), 'codex-pro-mlx-workers'), env = process.env, log = () => {}, spawn = cp.spawn, idleTimeoutMs = 300000, isActive = () => false }) {
  let worker, ready, current, serial = Promise.resolve(), sequence = 0, disposed = false, idleTimer;
  function scheduleIdle(child) {
    clearTimeout(idleTimer);
    if (idleTimeoutMs <= 0) return;
    idleTimer = setTimeout(() => {
      if (worker === child && isActive()) { scheduleIdle(child); return; }
      if (worker === child && !current) {
        log('Unloading idle MLX Whisper Turbo model');
        reset(new Error('MLX worker idle timeout'), child);
      }
    }, idleTimeoutMs);
    idleTimer.unref?.();
  }
  function reset(error, child = worker) {
    if (!child || child !== worker) return;
    clearTimeout(idleTimer);
    worker = undefined;
    ready?.reject(error);
    ready = undefined;
    current?.reject(error);
    current = undefined;
    child.kill('SIGKILL');
  }
  function start() {
    if (disposed) return Promise.reject(new Error('MLX worker disposed'));
    if (worker) return ready.promise;
    if (!fs.existsSync(python) || !fs.existsSync(path.join(model, 'weights.safetensors'))) {
      return Promise.reject(new Error('MLX Python or model is unavailable. Check codexPro.mlxPython and codexPro.mlxWhisperModelPath; your audio remains saved'));
    }
    let script;
    try { script = cachedWorker(workerDirectory); }
    catch (error) { return Promise.reject(new Error(`MLX worker cache unavailable: ${error.message}. Your audio remains saved`)); }
    let resolve, reject;
    const promise = new Promise((a,b) => { resolve=a; reject=b; });
    ready = { promise, resolve, reject };
    const child = spawn(python, ['-u', script, model], {
      env: { ...env, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1' }, stdio: ['pipe','pipe','pipe']
    });
    worker = child;
    let buffer = '', stderr = '';
    const timer = setTimeout(() => reset(new Error('MLX model startup timed out'), child), 180000);
    promise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.stdin.on('error', error => reset(error, child));
    child.stdout.on('data', data => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
        if (worker !== child) return;
        try {
          const reply = JSON.parse(line);
          if (reply.ready) { ready.resolve(); log('MLX Whisper Turbo model ready (Metal GPU)'); scheduleIdle(child); }
          else if (reply.id === current?.id) {
            const pending = current; current = undefined;
            scheduleIdle(child);
            if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(String(reply.text || '').replace(/\s+/g,' ').trim());
          } else if (reply.error && !reply.id) reset(new Error(reply.error), child);
        } catch (error) { reset(new Error(`Invalid MLX worker response: ${error.message}`), child); }
      }
    });
    child.on('error', error => reset(error, child));
    child.on('close', () => reset(new Error(`MLX worker stopped. ${stderr.trim()}`), child));
    log('Loading MLX Whisper Turbo on Metal GPU');
    return promise;
  }
  function transcribe(audio, { language = 'en', signal, timeoutMs = 900000 } = {}) {
    const operation = async () => {
      if (signal?.aborted) throw new Error('MLX transcription cancelled');
      clearTimeout(idleTimer);
      let timer, abort, ended = false;
      try {
        return await new Promise((resolve,reject) => {
          const fail = error => { ended = true; reset(error); reject(error); };
          abort = () => fail(new Error('MLX transcription cancelled'));
          signal?.addEventListener('abort',abort,{once:true});
          timer = setTimeout(() => fail(new Error('MLX transcription timed out; recording retained for retry')),timeoutMs);
          start().then(() => {
            if (ended || signal?.aborted || disposed) throw new Error('MLX transcription cancelled');
            const id = ++sequence;
            current = { id, resolve, reject };
            worker.stdin.write(JSON.stringify({ id, audio, language })+'\n');
          }).catch(reject);
        });
      } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
    };
    const result = serial.then(operation);
    serial = result.catch(() => {});
    return result;
  }
  return { transcribe, warm: start, dispose() { disposed=true; reset(new Error('MLX worker disposed')); } };
}
module.exports = { createMlxWhisper };
