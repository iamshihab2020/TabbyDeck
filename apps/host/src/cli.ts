// The tabbydeck.exe entry point.
import { run } from './main.ts';

run(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
