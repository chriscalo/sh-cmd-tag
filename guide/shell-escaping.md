---
title: "Shell Escaping"
---

# Shell Escaping

Every value interpolated into an `sh` template is automatically escaped before it
reaches the shell. This protects against shell injection: untrusted input can't
break out of its argument and run arbitrary commands.

::: info This page is about `sh`
`cmd` runs a program directly instead of through a shell, and does not escape
interpolated values at all — it splits the finished command string on
whitespace. There is no shell to inject into, but a value containing spaces
becomes several arguments. See [Interpolation](/guide/interpolation#strings) for
the details.
:::

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

::: danger `markSafeString()` does not work when interpolated
The example below is the intended behavior, but it throws today:
`markSafeString()` returns a boxed `String`, which the interpolator routes into
its flags-object branch before it checks whether the value is marked safe, so
you get `Invalid flag name: "0"` instead of the command. Track the fix in
[issue #32](https://github.com/chriscalo/sh-cmd-tag/issues/32). Until then, put
trusted literal text directly in the template — `` sh`ls -la ${path}` `` rather
than `` sh`ls ${markSafeString("-la")} ${path}` `` — which leaves escaping in
force for the values that actually need it.
:::

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
