process.chdir(import.meta.dirname);

process.chdir("../..")

import {$} from 'execa';

await $({stdout:"inherit",stderr:"inherit"})`./mach build faster`;

process.on('SIGINT', function() {
  process.exit();
});
