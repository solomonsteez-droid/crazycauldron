/**
 * Sound hooks, with nothing to play yet.
 *
 * There is no audio in the repo. Rather than leave the call sites to be written
 * later - which is how a game ends up silent forever - every cue the game wants
 * is named in ambience.json and called from today. If the file exists it plays;
 * if it does not, a short synthesised tone stands in for a UI cue and an
 * ambient loop simply stays quiet. Dropping real files into
 * client/public/assets/sound/ is then the whole job.
 *
 * Volumes live in localStorage, per browser, because they are a preference
 * about this device rather than progress the server should be storing.
 */

import { AMBIENCE, type SoundCue } from "@crazycauldron/shared";

const STORAGE_KEY = "cc.volume.v1";
const SOUND_DIR = "/assets/sound";

export type Channel = "master" | "ambient" | "effects";
export type Volumes = Record<Channel, number>;

const DEFAULTS: Volumes = { ...AMBIENCE.sound.defaults };

function load(): Volumes {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<Volumes>;
    const clamp = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    return {
      master: clamp(saved.master, DEFAULTS.master),
      ambient: clamp(saved.ambient, DEFAULTS.ambient),
      effects: clamp(saved.effects, DEFAULTS.effects),
    };
  } catch {
    // Private browsing, a cleared profile, a corrupt value - any of them just
    // means the defaults.
    return { ...DEFAULTS };
  }
}

/**
 * One mixer per tab.
 *
 * Deliberately not a Phaser sound manager: the ambient bed has to survive the
 * scene restarts that travelling between maps causes, and the synthesised
 * fallback needs a raw AudioContext anyway.
 */
class SoundBoard {
  private volumes: Volumes = load();
  private context: AudioContext | null = null;
  private ambient: HTMLAudioElement | null = null;
  private ambientMap = -1;
  /** Files already known to be absent, so a missing cue is asked for once. */
  private readonly missing = new Set<string>();

  get levels(): Volumes {
    return { ...this.volumes };
  }

  setVolume(channel: Channel, value: number) {
    this.volumes[channel] = Math.min(1, Math.max(0, value));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // A browser that refuses storage still gets the volume for this session.
    }
    if (this.ambient) this.ambient.volume = this.gain("ambient");
  }

  private gain(channel: Exclude<Channel, "master">): number {
    return this.volumes.master * this.volumes[channel];
  }

  /**
   * Starts the loop for a map, or stops the previous one if there is nothing
   * authored for this one. Called on every map change, including back to the
   * hub, so the bed always matches where the player is standing.
   */
  enterMap(mapId: number) {
    if (mapId === this.ambientMap) return;
    this.ambientMap = mapId;

    this.ambient?.pause();
    this.ambient = null;

    const entry = AMBIENCE.sound.ambient.find((a) => a.map === mapId);
    if (!entry || this.missing.has(entry.file)) return;

    const audio = new Audio(`${SOUND_DIR}/${entry.file}`);
    audio.loop = true;
    audio.volume = this.gain("ambient");
    audio.addEventListener("error", () => {
      // Remembered, so travelling back and forth does not retry a 404 each time.
      this.missing.add(entry.file);
      if (this.ambient === audio) this.ambient = null;
    });
    // Autoplay is refused until the page has been interacted with; the click
    // that moved the player counts, so this usually succeeds on the second try.
    void audio.play().catch(() => undefined);
    this.ambient = audio;
  }

  /** A one-shot cue by id. Unknown ids are ignored rather than thrown. */
  play(id: string) {
    const cue = AMBIENCE.sound.cues.find((c) => c.id === id);
    if (!cue) return;
    if (this.gain("effects") <= 0) return;

    if (this.missing.has(cue.file)) return this.tone(cue);

    const audio = new Audio(`${SOUND_DIR}/${cue.file}`);
    audio.volume = this.gain("effects");
    audio.addEventListener("error", () => {
      this.missing.add(cue.file);
      this.tone(cue);
    });
    void audio.play().catch(() => this.tone(cue));
  }

  /** The stand-in: one short note, quiet enough not to become annoying. */
  private tone(cue: SoundCue) {
    const level = this.gain("effects");
    if (level <= 0) return;

    try {
      if (!this.context) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      }
      if (this.context.state === "suspended") void this.context.resume();

      const at = this.context.currentTime;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = "triangle";
      osc.frequency.value = cue.tone;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.08 * level), at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + cue.ms / 1000);
      osc.connect(gain).connect(this.context.destination);
      osc.start(at);
      osc.stop(at + cue.ms / 1000 + 0.02);
    } catch {
      // Audio is a nicety; never let it break an action.
    }
  }

  stop() {
    this.ambient?.pause();
    this.ambient = null;
    this.ambientMap = -1;
  }
}

export const sound = new SoundBoard();
