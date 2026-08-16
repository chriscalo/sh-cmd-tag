<template>
  <div class="code-only-layout">
    <a class="raw-link" :href="rawUrl" target="_blank" rel="noopener">raw</a>
    <Content />
  </div>
</template>

<script setup>
  import { Content, useData } from "vitepress";
  import { computed } from "vue";
  
  const { page, site } = useData();
  const rawUrl = computed(() => {
    const sourcePath = page.value.relativePath.replace(/\.md$/, "");
    return site.value.base + sourcePath + ".raw";
  });
</script>

<style>
  html:has(.code-only-layout),
  body:has(.code-only-layout) {
    margin: 0;
    padding: 0;
  }
  
  .code-only-layout {
    background: var(--vp-c-bg);
    min-height: 100vh;
    position: relative;
  }
  
  .code-only-layout .raw-link {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
    color: var(--vp-c-text-2);
    font-family: var(--vp-font-family-mono);
    font-size: 0.85rem;
    text-decoration: none;
  }
  
  .code-only-layout .raw-link:hover {
    color: var(--vp-c-brand-1);
    text-decoration: underline;
  }
  
  .code-only-layout > div {
    padding: 0;
    margin: 0;
  }
  
  .code-only-layout div[class*="language-"] {
    margin: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
  
  .code-only-layout div[class*="language-"] pre {
    padding: 1.5rem;
    line-height: 1.5;
  }
  
  .code-only-layout div[class*="language-"] .copy {
    top: 0.75rem;
    right: 0.75rem;
  }
  
  /* Hide vitepress's language label (e.g. "sh") that floats over the
     top-right of every code block. */
  .code-only-layout div[class*="language-"] .lang {
    display: none;
  }
  
  /* The wrapper .md file has just a code-import directive — hide any stray
     heading/empty paragraph vitepress adds around it. */
  .code-only-layout h1,
  .code-only-layout p:empty {
    display: none;
  }
</style>
