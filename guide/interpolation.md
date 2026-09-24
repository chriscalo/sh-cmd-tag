---
title: "Interpolation"
---

# Interpolation

Values interpolated into an `sh` or `cmd` template are converted to command-line
text based on their type: strings become arguments, objects become flags, and
arrays become argument lists. How much escaping is applied depends on the tag —
`sh` quotes what it interpolates, `cmd` does not.

## Strings

With `sh`, a string is inserted as a single, shell-escaped argument:

```javascript
const filename = "my file.txt";
await sh`touch ${filename}`;
```

The interpolated value is escaped so the space can't split it into two
arguments. The command that runs is:

```sh
touch 'my file.txt'
```

See [Shell Escaping](/guide/shell-escaping) for the full details, including how
to opt out for trusted input.

::: warning `cmd` does not escape interpolated values
`cmd` builds the command by stringifying values as-is, then splits the result on
whitespace to get the argument list. A value containing a space therefore
becomes *two* arguments rather than one:

```javascript
const filename = "my file.txt";
await cmd`touch ${filename}`; // runs touch with ["my", "file.txt"]
```

Quote the placeholder yourself when a value may contain whitespace — the
splitter honors quotes — or use `sh`, which escapes for you:

```javascript
await cmd`touch "${filename}"`; // runs touch with ["my file.txt"]
```

Because `cmd` never invokes a shell, an unescaped value can't inject a second
command the way it could with `sh`; the failure mode is a mis-split argument,
not shell injection.
:::

## Objects become flags

An object expands into `--key=value` flags. Boolean `true` becomes a bare
`--flag`, and falsy values are dropped entirely:

```javascript
const options = { regexp: "error", "ignore-case": true, quiet: false };
await sh`grep app.log ${options}`;
```

This produces (note that `quiet: false` is omitted):

```sh
grep app.log --regexp=error --ignore-case
```

This is handy for building commands from a config object without manually
concatenating flags.

## Arrays become arguments

An array expands into multiple space-separated arguments — escaped individually
under `sh`, stringified as-is under `cmd`:

```javascript
const files = ["file1.txt", "file2.txt"];
await sh`rm ${files}`;
```

Which becomes:

```sh
rm file1.txt file2.txt
```

An element containing a space stays one argument under `sh` (`rm 'my file.txt'`)
but splits into two under `cmd`, for the same reason a plain string does.

## Combining interpolations

You can mix interpolation types in a single command:

```javascript
const flags = { verbose: true };
const paths = ["src", "test"];
await sh`eslint ${flags} ${paths}`;
```

Which becomes:

```sh
eslint --verbose src test
```

::: info `sh` vs `cmd`
Both tags build flags from objects and argument lists from arrays the same way,
and both quote object *values* that contain spaces (`--name='my file.txt'`).
They differ in whether the command runs through a shell, and in escaping: `sh`
escapes every interpolated string and array element, `cmd` escapes none of them
and splits the finished command on whitespace. Prefer `sh` when interpolating
values that may contain spaces, quotes, or other separators.
:::
