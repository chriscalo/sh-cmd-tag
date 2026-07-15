<template>
  <CodeOnlyLayout v-if="frontmatter.layout === 'code-only'" />
  <Layout v-else>
    <template #doc-before>
      <div class="doc-action-buttons">
        <CopyButtons />
        <FileABug />
      </div>
      <nav
        v-if="page.breadcrumbs && page.breadcrumbs.length"
        class="breadcrumbs"
        aria-label="Breadcrumb"
      >
        <template v-for="(crumb, index) in page.breadcrumbs" :key="index">
          <span v-if="index > 0" class="breadcrumbs-separator">/</span>
          <a v-if="crumb.link" :href="withBase(crumb.link)">{{ crumb.text }}</a>
          <span v-else>{{ crumb.text }}</span>
        </template>
      </nav>
    </template>
  </Layout>
</template>

<script setup>
  import DefaultTheme from "vitepress/theme";
  import { useData, withBase } from "vitepress";
  import CopyButtons from "./CopyButtons.vue";
  import FileABug from "./FileABug.vue";
  import CodeOnlyLayout from "./CodeOnlyLayout.vue";
  
  const { Layout } = DefaultTheme;
  const { frontmatter, page } = useData();
</script>
