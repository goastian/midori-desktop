import { Image } from "./base/image.mjs";

export class WebPanelSoundIcon extends Image {
  constructor() {
    super({ classList: ["sb2-sound-icon"] });
  }

  /**
   *
   * @param {boolean} value
   * @returns {WebPanelSoundIcon}
   */
  setSoundPlaying(value) {
    return this.toggleAttribute("soundplaying", value);
  }

  /**
   *
   * @param {boolean} value
   * @returns {WebPanelSoundIcon}
   */
  setMuted(value) {
    return this.toggleAttribute("muted", value);
  }
}
