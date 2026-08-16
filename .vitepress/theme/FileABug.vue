<template>
  <button
    class="inline-copy-btn file-a-bug-btn"
    @mousedown.prevent
    @click="fileABug"
  >
    <BugIcon />
    File a Bug
  </button>
</template>

<script setup>
  import { h } from "vue";
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

  const BugIcon = () => h("svg", ICON_ATTRS, [
    h("path", { d: "m8 2 1.88 1.88" }),
    h("path", { d: "M14.12 3.88 16 2" }),
    h("path", {
      d: "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1",
    }),
    h("path", {
      d: "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1"
        + " 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6",
    }),
    h("path", { d: "M12 20v-9" }),
    h("path", { d: "M6.53 9C4.6 8.8 3 7.1 3 5" }),
    h("path", { d: "M6 13H2" }),
    h("path", {
      d: "M3 21c0-2.1 1.7-3.9 3.8-4",
    }),
    h("path", {
      d: "M20.97 5c0 2.1-1.6 3.8-3.5 4",
    }),
    h("path", { d: "M22 13h-4" }),
    h("path", {
      d: "M17.2 17c2.1.1 3.8 1.9 3.8 4",
    }),
  ]);

  const MAX_SELECTION = 2000;
  const MAX_URL_LENGTH = 8000;
  const ELLIPSIS = "…";

  function buildIssueUrl(selectedText) {
    const url = new URL(
      "https://github.com/chriscalo/sh-cmd-tag/issues/new",
    );
    const pageUrl = page.value.fullUrl || location.href;
    const parts = [`**Page:** ${pageUrl}`];
    if (selectedText) {
      const quoted = selectedText
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      parts.push(`**Selected text:**\n${quoted}`);
    }
    url.searchParams.set("body", parts.join("\n\n"));
    return url;
  }

  function fileABug() {
    let selectedText =
      window.getSelection()?.toString().trim() || "";
    if (selectedText.length > MAX_SELECTION) {
      selectedText =
        selectedText.slice(0, MAX_SELECTION - ELLIPSIS.length) + ELLIPSIS;
    }
    let url = buildIssueUrl(selectedText);
    while (
      url.toString().length > MAX_URL_LENGTH
      && selectedText.length > ELLIPSIS.length
    ) {
      const target = Math.max(
        ELLIPSIS.length,
        Math.floor(selectedText.length * 0.8),
      );
      selectedText =
        selectedText.slice(0, target - ELLIPSIS.length) + ELLIPSIS;
      url = buildIssueUrl(selectedText);
    }
    window.open(
      url.toString(), "_blank", "noopener,noreferrer",
    );
  }
</script>
