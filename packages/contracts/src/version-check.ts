/** Background check for newer CLI versions. Implemented by S2. */
export interface VersionCheck {
  maybeNotify(): void;
}
