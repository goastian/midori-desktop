process.chdir(import.meta.dirname);

process.chdir("../..")

import {$} from 'execa';

const p_run = $({stdout:"inherit",stderr:"inherit"})`./mach run`;

process.on('SIGINT', function() {
  process.exit();
});