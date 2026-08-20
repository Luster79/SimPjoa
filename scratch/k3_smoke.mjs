import { createConfig } from '../core/config.js';
import { check_course_change } from '../harness/asserts-course-change.js';

const config = createConfig();
const results = [];
const check = (name, pass, detail, xfail) => { results.push({ name, pass, detail, xfail }); console.log(`[${pass ? 'PASS' : 'FAIL'}${xfail ? ':' + xfail : ''}] ${name}\n    ${detail}`); };
check_course_change(config, check, true);
console.log(`\n${results.length} checks ran.`);
