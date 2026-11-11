export type SnowmanCue = 'step' | 'magic' | 'hat' | 'face' | 'belly' | 'pickup' | 'falling' | 'landing'
  | 'breath' | 'hatTip' | 'jump' | 'blush';

export function createSnowmanCues(context: AudioContext, noise: AudioBuffer, output: AudioNode) {
  let active = false;
  let cueStart = 0;
  const playing = new Set<AudioScheduledSourceNode>();

  function connect(source: AudioScheduledSourceNode, input: AudioNode, offset: number, duration: number, volume: number) {
    const start = cueStart + offset;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    input.connect(envelope).connect(output);
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      input.disconnect();
      envelope.disconnect();
    };
    source.start(start);
    source.stop(start + duration);
  }

  function crunch(offset: number, duration: number, frequency: number, volume: number) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    source.connect(filter);
    connect(source, filter, offset, duration, volume);
  }

  function tone(offset: number, duration: number, from: number, to: number, volume: number, type: OscillatorType = 'sine') {
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(from, cueStart + offset);
    source.frequency.exponentialRampToValueAtTime(to, cueStart + offset + duration);
    connect(source, source, offset, duration, volume);
  }

  function stop() {
    for (const source of playing) source.stop();
    playing.clear();
  }

  return {
    setActive(next: boolean) {
      active = next;
      if (!active) stop();
    },
    play(cue: SnowmanCue) {
      if (!active || context.state !== 'running' || document.hidden) return;
      if (cue !== 'step') stop();
      cueStart = context.currentTime;
      switch (cue) {
        case 'step':
          crunch(0, 0.18, 610, 0.17);
          crunch(0.026, 0.09, 1900, 0.09);
          break;
        case 'magic':
          crunch(0.21, 0.62, 680, 0.09);
          [880, 1175, 1480, 1760].forEach((pitch, i) => tone(0.32 + i * 0.13, 0.28, pitch, pitch, 0.065));
          break;
        case 'hat':
          crunch(0.24, 0.18, 1200, 0.14);
          tone(0.72, 0.07, 330, 130, 0.13, 'triangle');
          tone(0.96, 0.18, 760, 340, 0.075);
          break;
        case 'face':
          tone(0.24, 0.17, 200, 400, 0.12, 'triangle');
          for (let i = 0; i < 5; i++) crunch(0.48 + i * 0.045, 0.03, 2100 - i * 140, 0.12);
          tone(0.72, 0.24, 510, 150, 0.11, 'triangle');
          break;
        case 'belly':
          crunch(0.48, 0.21, 390, 0.25);
          tone(0.72, 0.17, 155, 295, 0.12, 'triangle');
          tone(0.88, 0.12, 860, 610, 0.035);
          tone(1, 0.1, 740, 500, 0.032);
          break;
        case 'pickup':
          crunch(0, 0.18, 520, 0.22);
          tone(0.01, 0.25, 135, 490, 0.13, 'triangle');
          tone(0.19, 0.09, 690, 290, 0.10);
          break;
        case 'falling':
          tone(0, 0.8, 1260, 280, 0.085);
          crunch(0, 0.75, 1350, 0.11);
          for (let i = 0; i < 6; i++) tone(i * 0.075, 0.045, 440 - i * 30, 180, 0.065, 'triangle');
          break;
        case 'landing':
          crunch(0, 0.27, 340, 0.35);
          tone(0, 0.17, 105, 46, 0.19);
          tone(0.24, 0.26, 230, 480, 0.13, 'triangle');
          tone(0.45, 0.24, 1140, 1140, 0.05);
          tone(0.51, 0.27, 1580, 1580, 0.035);
          break;
        case 'breath':
          crunch(0.29, 0.72, 860, 0.12);
          tone(0.46, 0.48, 565, 280, 0.035);
          tone(0.91, 0.30, 1280, 1240, 0.035);
          break;
        case 'hatTip':
          crunch(0.24, 0.31, 1460, 0.18);
          tone(0.51, 0.16, 435, 660, 0.075, 'triangle');
          tone(0.72, 0.22, 660, 880, 0.065, 'triangle');
          tone(1.21, 0.10, 275, 150, 0.13, 'triangle');
          break;
        case 'jump':
          tone(0.25, 0.35, 155, 510, 0.16, 'triangle');
          [784, 1047, 1319].forEach((pitch, i) => tone(0.48 + i * 0.10, 0.25, pitch, pitch, 0.065));
          crunch(0.92, 0.25, 430, 0.24);
          break;
        case 'blush':
          tone(0.27, 0.21, 640, 780, 0.055);
          tone(0.52, 0.19, 810, 715, 0.065);
          tone(0.75, 0.23, 715, 830, 0.055);
          tone(1.02, 0.42, 1319, 1319, 0.045);
          break;
      }
    },
  };
}
