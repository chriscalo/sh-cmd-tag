# 🧑‍💻 Code Style Guide

This guide applies to all contributors—human and AI—working in this
repository. It defines how code should be written, structured, and tested.

---

## ✨ Global Conventions

These guidelines apply to all languages used in this project.

### Formatting

**✅ DO use 2-space indentation in all languages.**

```js
function compute() {
  return true;
}
```

**❌ DON’T use other indentation styles like 4-space.**

```js
function compute() {
    return true;
}
```

**✅ DO wrap lines at 80 characters.**

All files (HTML, CSS, JavaScript, Markdown) should be wrapped at 80
characters to ensure readability across different screen sizes and tools.

**❌ DON’T let lines exceed 80 characters.** An exception can be made if
wrapping a line would harm readability or break functionality (e.g., for long
string literals or URLs).

**✅ DO indent blank lines to match surrounding code.**

```js
function main() {
  stepOne();
  
  stepTwo();
}
```

**❌ DON’T leave blank lines truly empty.**

```js
function main() {
  stepOne();

  stepTwo();
}
```

> Preserves visual structure and avoids noisy diffs.

**✅ DO use blank lines to group related lines of code.**

This creates visual "paragraphs" that make code easier to scan and
understand.

```js
function processData(data) {
  const validatedData = validate(data);
  if (!validatedData) {
    return null;
  }
  
  const result = transform(validatedData);
  logResult(result);
  
  return result;
}
```

**❌ DON’T write dense, unbroken blocks of code.**

```js
function processData(data) {
  const validatedData = validate(data);
  if (!validatedData) {
    return null;
  }
  const result = transform(validatedData);
  logResult(result);
  return result;
}
```

---

## 📄 HTML

**✅ DO indent all child tags, including `<head>` and `<body>`.**

```html
<html>
  <head>
    <title>My App</title>
  </head>
  <body>
    <main>
      <h1>Welcome</h1>
    </main>
  </body>
</html>
```

**❌ DON’T leave top-level tags un-indented.**

```html
<html>
<head>
  <title>My App</title>
</head>
<body>
  <main>
    <h1>Welcome</h1>
  </main>
</body>
</html>
```

**✅ DO use meaningful attributes for selecting elements in CSS and JS.**

Use `data-*` attributes for JS hooks and descriptive class names for styling.

```html
<button data-action="generate-scale" class="action-button">
  Generate
</button>
```

**❌ DON’T use `id` attributes for styling or behavior.** They create high
specificity in CSS and can only be used once per page, making them brittle.

```html
<button id="generate-button">Generate</button>
```

**✅ DO use `<template>` elements for dynamic HTML.**

This keeps markup in HTML files and avoids mixing it with JavaScript logic.

```html
<template name="user-card">
  <div class="user-card">
    <h3 class="user-name"></h3>
    <p class="user-email"></p>
  </div>
</template>

<script name="user-card">
  const template = document.querySelector(`template[name="user-card"]`);
  const card = template.content.cloneNode(true);
  card.querySelector(".user-name").textContent = "John Doe";
  card.querySelector(".user-email").textContent = "john.doe@example.com";
  document.body.appendChild(card);
</script>
```

**❌ DON’T build HTML using string concatenation or template literals in
JavaScript.** This is hard to read, maintain, and can lead to security
vulnerabilities (XSS).

```js
const userName = "John Doe";
const userEmail = "john.doe@example.com";
const userCardHtml = `
  <div class="user-card">
    <h3 class="user-name">${userName}</h3>
    <p class="user-email">${userEmail}</p>
  </div>
`;
document.body.innerHTML += userCardHtml;
```

**✅ DO avoid inline `style` attributes.**

Keep styles in CSS files. For dynamic values (e.g., from JavaScript), set
CSS Custom Properties and use them in your stylesheet.

```html
<!-- JS sets --highlight-color -->
<div style="--highlight-color: #ff0000;">...</div>
```

```css
/* CSS uses the variable */
.highlight {
  background-color: var(--highlight-color, #ccc);
}
```

**❌ DON’T use inline `style` for static styling.**

```html
<div style="background-color: #ff0000; padding: 10px;">...</div>
```

**✅ DO collocate related `<template>`, `<script>`, and `<style>` blocks to
organize components.**

```html
<!-- Component: color-picker -->
<template name="color-picker">
  ...
</template>

<script name="color-picker">
  ...
</script>

<style name="color-picker">
  ...
</style>
```

**✅ DO indent content inside `<script>` and `<style>` tags.**

```html
<style>
  body {
    font-family: sans-serif;
  }
</style>
```

**❌ DON’T leave tag content un-indented.**

```html
<style>
body {
  font-family: sans-serif;
}
</style>
```

---

## 🎨 CSS

**✅ DO use kebab-case for class names.**

```css
.param-slider {
  /* ... */
}
```

**❌ DON’T use camelCase or snake_case for class names.**

```css
.paramSlider { /* ... */ }
.param_slider { /* ... */ }
```

**✅ DO write each declaration on its own line.**

```css
.widget {
  padding: 1rem;
  border-radius: 4px;
}
```

**❌ DON’T put an entire rule on a single line.**

```css
.widget { padding: 1rem; border-radius: 4px; }
```

**✅ DO use attribute and class selectors for styling.**

This approach keeps CSS specificity low and styles reusable.

```css
.param-slider {
  /* ... */
}

[data-action="generate"] {
  /* ... */
}
```

**❌ DON’T use BEM (Block, Element, Modifier).**

While useful in large-scale systems, it adds verbosity that is unnecessary
for this project.

```css
.param-slider__thumb--active { /* ... */ }
```

---

## 🔵 JavaScript

### Naming and Readability

**✅ DO use descriptive function and variable names instead of explanatory
comments.**

```js
class Color {
  constructor(hue, saturation, lightness) {
    this.hue = hue;
    this.saturation = saturation;
    this.lightness = lightness;
  }
}
```

**❌ DON’T use comments to explain what can be explained with better function
and variable naming.**

```js
// c is for color
class C {
  constructor(h, s, l) {
    this.h = h; // hue
    this.s = s; // saturation
    this.l = l; // lightness
  }
}
```

**✅ DO use descriptive, minimally sufficient names — especially for variables
that span multiple lines or carry conceptual weight.**

```js
const startColorInput = document.querySelector("#start-color");
const endColorInput = document.querySelector("#end-color");
```

**❌ DON’T use overly short or cryptic names.**

```js
const sc = document.querySelector("#start-color");
const ec = document.querySelector("#end-color");
```

**✅ DO structure top-level functions as short sequences of high-level helper
calls.** They should read like a checklist — nontrivial logic should be
extracted into named functions.

```js
function generateAndDisplayScale() {
  const params = getScaleParameters();
  if (!params) return;

  const colorScale = generateColorScale(params);
  const cssCode = formatAsCss(colorScale);

  renderScale(colorScale);
  renderCode(cssCode);
}
```

**✅ DO define helper functions in the order they are called.**

This encourages a top-down, declarative structure where readers encounter
high-level logic before diving into implementation details.

```js
function main() {
  const data = fetchData();
  const processedData = processData(data);
  displayData(processedData);
}

function fetchData() {
  // ...
}

function processData(data) {
  // ...
}

function displayData(data) {
  // ...
}
```

**❌ DON’T define helper functions out of order (e.g., alphabetically).**

```js
function main() {
  const data = fetchData();
  const processedData = processData(data);
  displayData(processedData);
}

function displayData(data) {
  // ...
}

function fetchData() {
  // ...
}

function processData(data) {
  // ...
}
```

**❌ DON’T embed detailed control flow, data transformation, or formatting
logic directly.**

```js
function generateAndDisplayScale() {
  const start = document.querySelector("#start").value;
  const end = document.querySelector("#end").value;
  const steps = parseInt(document.querySelector("#steps").value, 10);
  // ... more logic to parse colors, calculate interpolation ...
  const scale = [];
  for (let i = 0; i < steps; i++) {
    // ... complex interpolation logic ...
  }
  // ... logic to create DOM elements and display results ...
}
```

> Rule of thumb: if a block is more than ~3 lines or has internal branching,
> extract it.

**✅ DO extract meaningful intermediate variables instead of chaining multiple
operations inline.** It improves scanability, simplifies debugging, and lets you
name intent.

```js
function getHexValuesFromInputs() {
  const colorInputs = document.querySelectorAll(".color-input");
  const inputNodes = [...colorInputs];
  const hexValues = inputNodes.map(input => input.value);
  return hexValues;
}
```

**❌ DON’T stack multiple calls in a single expression when seeing the steps
improves readability and debugging.**

```js
function getHexValuesFromInputs() {
  return [...document.querySelectorAll(".color-input")].map(i => i.value);
}
```

> Each operation deserves its own line and name if it expresses a distinct
> step.

**✅ DO use well-named functions to express intent instead of comments.**

If a block of code requires a comment to explain what it does, extract it
into a function with a name that makes the comment unnecessary.

```js
function getValidatedColors() {
  const startColorHex = document.querySelector("[data-input='start-color']").value;
  const endColorHex = document.querySelector("[data-input='end-color']").value;

  const startColor = parseAndValidateColor(startColorHex);
  const endColor = parseAndValidateColor(endColorHex);

  if (!startColor || !endColor) {
    // ... handle invalid input ...
    return null;
  }

  return { startColor, endColor };
}

function parseAndValidateColor(hexString) {
  if (!hexString.startsWith("#")) {
    return null;
  }
  // ... more validation and parsing logic ...
  return new Color(hexString);
}
```

**❌ DON'T rely on comments to explain a block of logic.**

```js
function getValidatedColors() {
  const startColorHex = document.querySelector("[data-input='start-color']").value;
  const endColorHex = document.querySelector("[data-input='end-color']").value;

  // Parse and validate start color
  if (!startColorHex.startsWith("#")) {
    // ... handle invalid input ...
    return null;
  }
  const startColor = new Color(startColorHex);

  // Parse and validate end color
  if (!endColorHex.startsWith("#")) {
    // ... handle invalid input ...
    return null;
  }
  const endColor = new Color(endColorHex);

  return { startColor, endColor };
}
```

> If a comment explains *what a block of code is doing*, it's probably a
> missing function.

### Comment Positioning

**✅ DO place comments on the line before the code they describe.**

This is the preferred style for all languages and contexts, including object
properties, function parameters, and code blocks.

```js
function processColors(colors) {
  // Convert hex strings to Color objects
  const colorObjects = colors.map(hex => new Color(hex));
  
  // Calculate perceptual differences between adjacent colors
  const deltaE = calculateDeltaE(colorObjects);
  
  // Filter out colors that are too similar
  return filterSimilarColors(colorObjects, deltaE);
}

class ProcessResult {
  // true if exit code === 0
  ok: boolean;
  // ProcessError if code !== 0, undefined otherwise
  error: ProcessError | undefined;
}
```

**❌ DON'T use end-of-line comments.**

End-of-line comments create long lines, make code harder to scan and read,
and are harder to maintain when refactoring.

```js
function processColors(colors) {
  const colorObjects = colors.map(hex => new Color(hex));  // Convert hex strings to Color objects
  const deltaE = calculateDeltaE(colorObjects);            // Calculate perceptual differences between adjacent colors
  return filterSimilarColors(colorObjects, deltaE);       // Filter out colors that are too similar
}

class ProcessResult {
  ok: boolean;                     // true if exit code === 0
  error: ProcessError | undefined; // ProcessError if code !== 0, undefined otherwise
}
```

**✅ DO assign regular expressions to descriptive variables.**

This makes the expression's purpose clear and keeps complex patterns out of
the main logic flow.

```js
const hexColorRegex = /^#([0-9a-f]{3}){1,2}$/i;

function isValidHexColor(colorString) {
  return hexColorRegex.test(colorString);
}
```

**❌ DON’T use inline regular expressions.** They are cryptic and make the
surrounding code difficult to understand.

```js
function isValidHexColor(colorString) {
  return /^#([0-9a-f]{3}){1,2}$/i.test(colorString);
}
```

### Language Constructs

**✅ DO use `for...of` or `for...in` loops.**

Use `for...of` for iterable objects like arrays, and `for...in` for object
properties.

```js
for (const item of items) {
  console.log(item);
}
```

**❌ DON'T use C-style `for (;;)` loops.**

```js
for (let i = 0; i < items.length; i++) {
  console.log(items[i]);
}
```

**✅ DO use functional array methods for operations that conceptually feel like a pipeline transforming a collection of items.**

When the best mental model for the operation is data flowing through a series of transformations, use `.filter().map().join()` chains to match that conceptual framing.

```js
return items
  .filter(item => item.isValid)
  .map(item => item.name)
  .join(", ");
```

**❌ DON'T use imperative loops with mutative operations when pipeline processing is the natural mental model.**

```js
const names = [];
for (const item of items) {
  if (item.isValid) {
    names.push(item.name);
  }
}
return names.join(", ");
```

**✅ DO use prefer data structures to simplify complex boolean logic.**

Arrays and `.includes()` can make inclusion/exclusion logic more readable than chained boolean conditions.

```js
function shouldProcess(value) {
  const excludedValues = [null, undefined, false];
  return !excludedValues.includes(value);
}
```

**❌ DON'T chain multiple boolean conditions when a data structure is clearer.**

```js
function shouldProcess(value) {
  return value !== null && value !== undefined && value !== false;
}
```

**✅ DO use "double-quoted strings".**

For simple strings without double quotes, use standard double quotes.

```js
console.log("Hello");
```

For strings that must contain double quotes, use template literals (backticks)
to avoid escaping.

```js
const selector = `[data-input="start-color"]`;
const message = `He said, "Hello!"`;
```

**❌ DON’T use 'single-quoted strings' or escape double quotes.**

```js
// Avoid single quotes
console.log('Hello');

// Avoid escaping double quotes
const selector = "[data-input=\"start-color\"]";
const message = "He said, \"Hello!\"";
```

**✅ DO use trailing commas for multi-line lists.**

This simplifies adding and removing items and results in cleaner diffs.

```js
const options = {
  isEnabled: true,
  level: 5,
};

const values = [
  1,
  2,
  3,
];

someFunction(
  firstArgument,
  secondArgument,
);
```

**❌ DON’T use trailing commas for single-line lists.**

```js
const options = { isEnabled: true, level: 5, };
const values = [1, 2, 3,];
someFunction(firstArgument, secondArgument,);
```

### Modules and Imports

**✅ DO use the `node:` prefix for all Node.js built-in modules.**

This makes it clear that the import is a Node.js built-in and not a local
file or a third-party package.

```js
import fs from "node:fs";
import path from "node:path";
```

**❌ DON’T import built-in modules without the `node:` prefix.**

```js
import fs from "fs";
import path from "path";
```

### Testing

**✅ DO define `actual` and `expected` variables in tests.**

This improves readability and makes debugging easier by clearly stating what
is being tested against what was expected.

```js
test("should correctly calculate the sum", () => {
  const actual = sum(2, 3);
  const expected = 5;
  assert.equal(actual, expected);
});
```

**❌ DON'T embed function calls and literal values directly in assertions.**

```js
test("should correctly calculate the sum", () => {
  assert.equal(sum(2, 3), 5);
});
```

---

## 📝 Markdown

**✅ DO use dashes (`-`) for unordered lists.**

```markdown
- First item
- Second item
- Third item
```

**❌ DON’T use asterisks (`*`) for unordered lists.**

```markdown
* First item
* Second item
* Third item
```

> Dashes are more visually distinct and less ambiguous than asterisks, which can
> also be used for emphasis (italics/bold).
