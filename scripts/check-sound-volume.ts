import assert from "node:assert/strict";
import {
  DEFAULT_SOUND_VOLUME,
  clampSoundVolume,
  getSoundVolume,
  setSoundVolume,
  toggleSoundMute,
} from "../src/lib/sound/volume";

assert.equal(clampSoundVolume(0.8), 0.8);
assert.equal(clampSoundVolume(0), 0);
assert.equal(clampSoundVolume(-1), 0);
assert.equal(clampSoundVolume(2), 1);
assert.equal(clampSoundVolume("abc"), DEFAULT_SOUND_VOLUME);
assert.equal(clampSoundVolume(0.456), 0.46);
assert.equal(DEFAULT_SOUND_VOLUME, 0.8);

setSoundVolume(0.5);
assert.equal(getSoundVolume(), 0.5);
toggleSoundMute();
assert.equal(getSoundVolume(), 0);
toggleSoundMute();
assert.equal(getSoundVolume(), 0.5);
setSoundVolume(1.7);
assert.equal(getSoundVolume(), 1);

console.log("sound volume checks passed");
