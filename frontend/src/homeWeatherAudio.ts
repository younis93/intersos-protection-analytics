import type {HomeWeatherMode} from './homeWeather';
import {createSnowmanCues} from './homeSnowmanAudio';

export function createHomeWeatherAudio() {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }

  const length = context.sampleRate * 6;
  const noise = context.createBuffer(1, length, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

  const taps = context.createBuffer(1, length, context.sampleRate);
  const tapSamples = taps.getChannelData(0);
  for (let start = 0; start < length; start += context.sampleRate * (0.019 + Math.random() * 0.036)) {
    const offset = Math.floor(start);
    const decay = context.sampleRate * (0.0025 + Math.random() * 0.006);
    const strength = 0.12 + Math.random() * 0.3;
    for (let i = 0; i < decay * 4; i++) {
      tapSamples[(offset + i) % length] += (Math.random() * 2 - 1) * strength * Math.exp(-i / decay);
    }
  }

  function band(buffer: AudioBuffer, frequency: number, width: number) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = width;
    source.connect(filter);
    source.start();
    return filter;
  }

  const rain = context.createGain();
  rain.gain.value = 0;
  band(noise, 1250, 0.65).connect(rain);
  band(taps, 2050, 0.9).connect(rain);
  rain.connect(context.destination);

  const snow = context.createGain();
  snow.gain.value = 0;
  const wind = context.createGain();
  wind.gain.value = 0.75;
  band(noise, 305, 0.6).connect(wind);
  const swell = context.createOscillator();
  swell.frequency.value = 0.22;
  const modulation = context.createGain();
  modulation.gain.value = 0.24;
  swell.connect(modulation).connect(wind.gain);
  swell.start();
  wind.connect(snow).connect(context.destination);
  const snowmanVolume = context.createGain();
  snowmanVolume.gain.value = 0.9;
  snowmanVolume.connect(context.destination);
  const snowman = createSnowmanCues(context, noise, snowmanVolume);

  return {
    playSnowmanCue: snowman.play,
    unlock() {
      if (context.state === 'suspended') void context.resume().catch(() => {});
    },
    setMode(mode: HomeWeatherMode | null) {
      snowman.setActive(mode === 'snow');
      const now = context.currentTime;
      rain.gain.setTargetAtTime(mode === 'rain' ? 0.21 : 0, now, 0.07);
      snow.gain.setTargetAtTime(mode === 'snow' ? 0.16 : 0, now, 0.09);
    },
    dispose() {
      snowman.setActive(false);
      const now = context.currentTime;
      rain.gain.setTargetAtTime(0, now, 0.026);
      snow.gain.setTargetAtTime(0, now, 0.026);
      window.setTimeout(() => void context.close().catch(() => {}), 125);
    },
  };
}
