---
title: "Interpolation"
---

# Interpolation

Values interpolated into an `sh` or `cmd` template are converted to command-line
text based on their type. Strings are escaped, objects become flags, and arrays
become arguments. The same rules apply to both tags.

## Strings

A string is inserted as a single, shell-escaped argument:

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

An array expands into multiple space-separated arguments, each escaped
individually:

```javascript
const files = ["file1.txt", "file2.txt"];
await sh`rm ${files}`;
```

Which becomes:

```sh
rm file1.txt file2.txt
```

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
Object and array interpolation work identically for `sh` and `cmd`. The only
difference between the tags is whether the final command runs through a shell.
:::
