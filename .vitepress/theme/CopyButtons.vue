<template>
  <div class="copy-buttons">
    <button
      class="inline-copy-btn"
      :class="{ copied: linkCopied }"
      aria-live="polite"
      @mousedown.prevent
      @click="copyLink"
    >
      <span data-state="idle" :aria-hidden="String(linkCopied)">
        <LinkIcon />
        Copy Link
      </span>
      <span
        data-state="success"
        :aria-hidden="String(!linkCopied)"
        role="status"
      >
        <CheckIcon />
        Copied!
      </span>
    </button>
    <button
      class="inline-copy-btn"
      :class="{ copied: markdownCopied }"
      aria-live="polite"
      @mousedown.prevent
      @click="copyMarkdown"
      :disabled="!hasMarkdownSource"
    >
      <span
        data-state="idle"
        :aria-hidden="String(markdownCopied)"
      >
        <DocIcon />
        Copy Markdown
      </span>
      <span
        data-state="success"
        :aria-hidden="String(!markdownCopied)"
        role="status"
      >
        <CheckIcon />
        Copied!
      </span>
    </button>
  </div>
</template>

<script setup>
  import { ref, computed, h } from "vue";
  import { useData } from "vitepress";
  
  const { page } = useData();
  
  const ICON_ATTRS = {
    xmlns: "http://www.w3.org/2000/svg",
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
  
  const LinkIcon = () => h("svg", ICON_ATTRS, [
    h("path", {
      d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    }),
    h("path", {
      d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    }),
  ]);
  
  const CheckIcon = () => h("svg", ICON_ATTRS, [
    h("polyline", { points: "20 6 9 17 4 12" }),
  ]);
  
  const DocIcon = () => h("svg", ICON_ATTRS, [
    h("path", {
      d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    }),
    h("polyline", { points: "14 2 14 8 20 8" }),
    h("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
    h("line", { x1: "16", y1: "17", x2: "8", y2: "17" }),
    h("polyline", { points: "10 9 9 9 8 9" }),
  ]);
  
  const linkCopied = ref(false);
  const markdownCopied = ref(false);
  
  const hasMarkdownSource = computed(
    () => Boolean(page.value.markdownSourceBase64),
  );
  
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(page.value.fullUrl);
      linkCopied.value = true;
      setTimeout(() => linkCopied.value = false, 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  }
  
  async function copyMarkdown() {
    try {
      const markdown = atob(page.value.markdownSourceBase64);
      await navigator.clipboard.writeText(markdown);
      markdownCopied.value = true;
      setTimeout(() => markdownCopied.value = false, 2000);
    } catch (err) {
      console.error("Failed to copy markdown:", err);
    }
  }
</script>
