/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const HELPER = '/usr/lib/midori/midori-cpu-setup';
const PKEXEC = '/usr/bin/pkexec';

function run(path, args) {
  return new Promise(resolve => {
    const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    const process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
    process.init(file);
    process.runwAsync(args, args.length, {
      observe() {
        resolve(process.exitValue);
      },
    });
  });
}

export const ResourceCpuSetup = {
  async prepare(onAuthenticate) {
    if (!await IOUtils.exists(HELPER) || !await IOUtils.exists(PKEXEC)) return 'not-installed';
    const status = await run(HELPER, ['status-current']);
    if (status === 0) return 'session-required';
    if (status !== 3) return 'error';
    onAuthenticate();
    const code = await run(PKEXEC, ['--disable-internal-agent', HELPER, 'enable-current']);
    return code === 0 ? 'session-required' : code === 126 ? 'cancelled' : 'error';
  },
};
