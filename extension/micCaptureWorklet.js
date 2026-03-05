class KindlyClickMicCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs && inputs[0] && inputs[0][0];
    if (input && input.length) {
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("kindlyclick-mic-capture", KindlyClickMicCaptureProcessor);
