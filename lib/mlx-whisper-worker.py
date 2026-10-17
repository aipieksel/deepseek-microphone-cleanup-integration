"""Private local JSON-lines MLX worker. Audio never leaves this machine."""
import sys, json, contextlib

def emit(value):
    print(json.dumps(value), flush=True)

try:
    # Reserve stdout for the protocol, including third-party load/progress output.
    with contextlib.redirect_stdout(sys.stderr):
        import mlx.core as mx
        import mlx_whisper
        from mlx_whisper.transcribe import ModelHolder
        if not mx.metal.is_available():
            raise RuntimeError('MLX requires an Apple Silicon Mac with Metal')
        model_path = sys.argv[1]
        model = ModelHolder.get_model(model_path, mx.float16)
        mx.eval(model.parameters())
        mx.synchronize()
    emit({'ready': True})
    for line in sys.stdin:
        request = json.loads(line)
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = mlx_whisper.transcribe(request['audio'], path_or_hf_repo=model_path,
                    language=request['language'], task='transcribe', verbose=False,
                    condition_on_previous_text=False)
                mx.synchronize()
            emit({'id': request['id'], 'text': result['text']})
        except Exception as error:
            emit({'id': request['id'], 'error': str(error)})
except Exception as error:
    emit({'error': str(error)})
    sys.exit(1)
