/**
 * A plugin given to `FloconSetup.install`, with its options. Plugin packages implement it, for example
 * `new FloconFiles()` in `@openflocon/files`. `install` runs once Flocon is started.
 */
export interface FloconPluginFactory {
  install(): Promise<void>;
}
