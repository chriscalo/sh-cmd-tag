---
title: "Shell Escaping"
---

# Shell Escaping

Every value interpolated into an `sh` or `cmd` template is automatically escaped
before it reaches the shell. This protects against shell injection: untrusted
input can't break out of its argument and run arbitrary commands.

## Automatic escaping

Interpolated strings are quoted so their contents stay a single argument, no
matter what characters they contain:

```javascript
const userInput = "file with spaces; echo gotcha";
await sh`cat ${userInput}`;
```

The dangerous `;` never reaches the shell as a command separator. The command
safely becomes:

```sh
cat 'file with spaces; echo gotcha'
```

Without escaping, `; echo gotcha` would run as a second command. With
`sh-cmd-tag`, the whole string is treated as one filename.

## Opting out with `markSafeString()`

Sometimes you have trusted input that is *meant* to contain shell syntax — for
example, a fixed set of flags you control. Wrap it with
[`markSafeString()`](/reference/utilities#marksafestring) to skip escaping:

```javascript
import { sh, markSafeString } from "@chriscalo/sh-cmd-tag";

const safeArgs = markSafeString("-la --color=auto");
await sh`ls ${safeArgs} /home/user`;
```

No escaping is applied to a marked-safe string, so it becomes:

```sh
ls -la --color=auto /home/user
```

::: warning Only mark trusted input
`markSafeString()` disables the protection that prevents shell injection. Never
pass user input or any value you don't fully control through it. Use it only for
constants and values your own code produces.
:::

## Checking whether a value is marked safe

Use [`isSafeString()`](/reference/utilities#issafestring) to check whether a
value has been marked safe, and [`shellEscape()`](/reference/utilities#shellescape)
to escape a value manually when you need the escaped form outside of a template.

## Related

- [Interpolation](/guide/interpolation) — how strings, objects, and arrays are
  turned into command text.
- [Utilities reference](/reference/utilities) — the full signatures for
  `markSafeString`, `isSafeString`, and `shellEscape`.
