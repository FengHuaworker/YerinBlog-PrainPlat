import { validateSubdomain, classifyHost, RESERVED_EXACT } from '../src/lib/subdomain.ts';

const cases = [
  ['abc', true],
  ['my', false],
  ['admin', false],
  ['dashboard', false],
  ['dash', false],
  ['admin-blog', false],
  ['api-docs', false],
  ['secure-login', false],
  ['ab', false],
  ['-abc', false],
  ['abc-', false],
  ['a--b', false],
  ['123', false],
  ['xn--abc', false],
  ['MyBlog', false],
  ['myblogx', true],
  ['blog-2026', true],
];

let failed = 0;
for (const [name, expected] of cases) {
  const res = validateSubdomain(name);
  const pass = res.ok === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ->  ${res.ok ? 'ok' : res.reason}`);
}

const hostCases = [
  ['example.com', 'platform'],
  ['abc.example.com', 'tenant'],
  ['admin.example.com', 'reserved'],
  ['my.example.com', 'reserved'],
  ['dashboard.example.com', 'reserved'],
  ['a.b.example.com', 'unknown'],
  ['other.com', 'unknown'],
];
for (const [host, expected] of hostCases) {
  const info = classifyHost(host, 'example.com');
  const pass = info.kind === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${host}  ->  ${info.kind}`);
}

console.log(`\nreserved count: ${RESERVED_EXACT.size}`);
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
