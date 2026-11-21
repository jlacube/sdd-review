import { linuxBackendFactory } from './linux.js';
import { macosBackendFactory } from './macos.js';
import { unavailableBackend, type BackendFactory } from './observer.js';
import { windowsBackendFactory } from './windows.js';

/**
 * The observer backend of each operating system of C001-CON-15 (C001-ADR-006 §9): inotify on
 * Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows. Any other system has no observer:
 * every run reports both parts as "observation interrupted", never as observed.
 */
export function backendFactoryFor(platform: NodeJS.Platform = process.platform): BackendFactory {
  switch (platform) {
    case 'linux':
      return linuxBackendFactory();
    case 'darwin':
      return macosBackendFactory();
    case 'win32':
      return windowsBackendFactory();
    default:
      return unavailableBackend(`no working-tree observer for the operating system ${platform}`);
  }
}
