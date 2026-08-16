<script setup>
  import localSearchIndex from "@localSearchIndex";
  import {
    computedAsync,
    watchDebounced,
    onKeyStroke,
    useEventListener,
    useScrollLock,
    useSessionStorage
  } from "@vueuse/core";
  import { useFocusTrap } from "@vueuse/integrations/useFocusTrap";
  import Mark from "mark.js/src/vanilla.js";
  import MiniSearch from "minisearch";
  import { inBrowser, useData, useRouter } from "vitepress";
  import {
    computed,
    markRaw,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
  } from "vue";
  import { escapeRegExp } from "vitepress/dist/client/shared.js";
  import {
    createSearchTranslate
  } from "vitepress/dist/client/theme-default/support/translation.js";
  
  const emit = defineEmits(["close"]);
  
  const rootEl = shallowRef();
  const resultsEl = shallowRef();
  
  /* Search */
  
  const searchIndexData = shallowRef(localSearchIndex);
  
  // hmr
  if (import.meta.hot) {
    import.meta.hot.accept("@localSearchIndex", (mod) => {
      if (mod) {
        searchIndexData.value = mod.default;
      }
    });
  }
  
  const vitePressData = useData();
  const { activate } = useFocusTrap(rootEl, {
    immediate: true,
    allowOutsideClick: true,
    clickOutsideDeactivates: true,
    escapeDeactivates: true,
  });
  const { localeIndex, theme } = vitePressData;
  const searchIndex = computedAsync(async () =>
    markRaw(
      MiniSearch.loadJSON(
        (await searchIndexData.value[localeIndex.value]?.())?.default,
        {
          fields: ["title", "titles", "text"],
          storeFields: ["title", "titles", "text"],
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 },
            ...(theme.value.search?.provider === "local" &&
              theme.value.search.options?.miniSearch?.searchOptions),
          },
          ...(theme.value.search?.provider === "local" &&
            theme.value.search.options?.miniSearch?.options),
        },
      ),
    ),
  );
  
  const disableQueryPersistence = computed(() => {
    return (
      theme.value.search?.provider === "local" &&
      theme.value.search.options?.disableQueryPersistence === true
    );
  });
  
  const filterText = disableQueryPersistence.value ?
    ref("") :
    useSessionStorage("vitepress:local-search-filter", "");
  
  const results = shallowRef([]);
  
  const enableNoResults = ref(false);
  
  watch(filterText, () => {
    enableNoResults.value = false;
  });
  
  const mark = computedAsync(async () => {
    if (!resultsEl.value) return;
    return markRaw(new Mark(resultsEl.value));
  }, null);
  
  // Build a result's excerpt from the page text stored in the search index:
  // find the earliest place any matched term occurs, slice a window around
  // it, and trim to word boundaries. Returns escaped HTML; mark.js
  // highlights the terms afterward, the same as for the title.
  function buildExcerpt(text, match) {
    if (!text) return "";
    // The indexed text strips tags but keeps HTML entities (`&amp;`, `&#8203;`,
    // …). Decode them to real characters first, so windowing can't slice an
    // entity in half and escaping below can't double-encode it.
    const decoder = document.createElement("textarea");
    decoder.innerHTML = text;
    text = decoder.value;
    function escapeHtml(str) {
      return str.replace(
        /[&<>"]/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            [`"`]: "&quot;",
          })[char],
      );
    }
    const lower = text.toLowerCase();
    let pos = -1;
    for (const term in match) {
      const termIndex = lower.indexOf(term.toLowerCase());
      if (termIndex !== -1 && (pos === -1 || termIndex < pos)) pos = termIndex;
    }
    const WINDOW = 200;
    const start = pos === -1 ? 0 : Math.max(0, pos - 50);
    let slice = text.slice(start, start + WINDOW);
    if (start > 0) slice = "…" + slice.replace(/^\S+\s/, "");
    if (start + WINDOW < text.length) slice = slice.replace(/\s\S+$/, "") + "…";
    return `<p>${escapeHtml(slice)}</p>`;
  }
  
  watchDebounced(
    () => [searchIndex.value, filterText.value],
    async ([index, filterTextValue], old, onCleanup) => {
      let canceled = false;
      onCleanup(() => {
        canceled = true;
      });
      if (!index) return;
      // Search
      results.value = index
        .search(filterTextValue)
        .slice(0, 16);
      enableNoResults.value = true;
      // Build each result's excerpt by windowing the page text (stored in the
      // index via `storeFields`) around the best query match. There's no
      // per-result page fetch, so the result list never re-renders mid-search.
      const terms = new Set();
      results.value = results.value.map((entry) => {
        for (const term in entry.match) {
          terms.add(term);
        }
        return { ...entry, text: buildExcerpt(entry.text, entry.match) };
      });
      await nextTick();
      if (canceled) return;
      await new Promise((resolve) => {
        mark.value?.unmark({
          done: () => {
            mark.value?.markRegExp(formMarkRegex(terms), { done: resolve });
          }
        });
      });
      const excerpts = rootEl.value?.querySelectorAll(".result .excerpt") ?? [];
      for (const excerpt of excerpts) {
        excerpt
          .querySelector(`mark[data-markjs="true"]`)
          ?.scrollIntoView({ block: "center" });
      }
      // FIXME: without this whole page scrolls to the bottom
      resultsEl.value?.firstElementChild?.scrollIntoView({ block: "start" });
    },
    { debounce: 200, immediate: true },
  );
  
  /* Search input focus */
  
  const searchInput = ref();
  const disableReset = computed(() => {
    return filterText.value?.length <= 0;
  });
  function focusSearchInput(select = true) {
    searchInput.value?.focus();
    select && searchInput.value?.select();
  }
  
  onMounted(() => {
    focusSearchInput();
  });
  
  function onSearchBarClick(event) {
    if (event.pointerType === "mouse") {
      focusSearchInput();
    }
  }
  
  /* Search keyboard selection */
  
  const selectedIndex = ref(-1);
  const disableMouseOver = ref(true);
  
  watch(results, (list) => {
    selectedIndex.value = list.length ? 0 : -1;
    scrollToSelectedResult();
  });
  
  function scrollToSelectedResult() {
    nextTick(() => {
      const selectedEl = document.querySelector(".result.selected");
      selectedEl?.scrollIntoView({ block: "nearest" });
    });
  }
  
  onKeyStroke("ArrowUp", (event) => {
    event.preventDefault();
    selectedIndex.value--;
    if (selectedIndex.value < 0) {
      selectedIndex.value = results.value.length - 1;
    }
    disableMouseOver.value = true;
    scrollToSelectedResult();
  });
  
  onKeyStroke("ArrowDown", (event) => {
    event.preventDefault();
    selectedIndex.value++;
    if (selectedIndex.value >= results.value.length) {
      selectedIndex.value = 0;
    }
    disableMouseOver.value = true;
    scrollToSelectedResult();
  });
  
  const router = useRouter();
  
  onKeyStroke("Enter", (event) => {
    if (event.isComposing) return;
    if (
      event.target instanceof HTMLButtonElement &&
      event.target.type !== "submit"
    ) {
      return;
    }
    const selectedPackage = results.value[selectedIndex.value];
    if (event.target instanceof HTMLInputElement && !selectedPackage) {
      event.preventDefault();
      return;
    }
    if (selectedPackage) {
      router.go(selectedPackage.id);
      emit("close");
    }
  });
  
  onKeyStroke("Escape", () => {
    emit("close");
  });
  
  /* Translations */
  
  const defaultTranslations = {
    button: {
      buttonText: "Search"
    },
    modal: {
      displayDetails: "Display detailed list",
      resetButtonTitle: "Reset search",
      backButtonTitle: "Close search",
      noResultsText: "No results for",
      footer: {
        selectText: "to select",
        selectKeyAriaLabel: "enter",
        navigateText: "to navigate",
        navigateUpKeyAriaLabel: "up arrow",
        navigateDownKeyAriaLabel: "down arrow",
        closeText: "to close",
        closeKeyAriaLabel: "escape",
      },
    },
  };
  
  const translate = createSearchTranslate(defaultTranslations);
  
  /* Back */
  
  onMounted(() => {
    // Prevents going to previous site
    window.history.pushState(null, "", null);
  });
  
  useEventListener("popstate", (event) => {
    event.preventDefault();
    emit("close");
  });
  
  /** Lock body */
  
  const isLocked = useScrollLock(inBrowser ? document.body : null);
  
  onMounted(() => {
    nextTick(() => {
      isLocked.value = true;
      nextTick().then(() => activate());
    });
  });
  
  onBeforeUnmount(() => {
    isLocked.value = false;
  });
  
  function resetSearch() {
    filterText.value = "";
    nextTick().then(() => focusSearchInput(false));
  }
  
  function formMarkRegex(terms) {
    return new RegExp(
      [...terms]
        .sort((left, right) => right.length - left.length)
        .map((term) => `(${escapeRegExp(term)})`)
        .join("|"),
      "gi",
    );
  }
  
  function onMouseMove(event) {
    if (!disableMouseOver.value) return;
    const resultEl = event.target
      ?.closest(".result");
    const index = Number.parseInt(resultEl?.dataset.index);
    if (index >= 0 && index !== selectedIndex.value) {
      selectedIndex.value = index;
    }
    disableMouseOver.value = false;
  }
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      role="button"
      :aria-owns="results?.length ? 'localsearch-list' : undefined"
      aria-expanded="true"
      aria-haspopup="listbox"
      aria-labelledby="localsearch-label"
      class="VPLocalSearchBox"
    >
      <div class="backdrop" @click="$emit('close')" />

      <div class="shell">
        <form
          class="search-bar"
          @pointerup="onSearchBarClick($event)"
          @submit.prevent=""
        >
          <label
            :title="translate('button.buttonText')"
            id="localsearch-label"
            for="localsearch-input"
          >
            <span
              aria-hidden="true"
              class="vpi-search search-icon local-search-icon"
            />
          </label>
          <div class="search-actions before">
            <button
              class="back-button"
              :title="translate('modal.backButtonTitle')"
              @click="$emit('close')"
            >
              <span class="vpi-arrow-left local-search-icon" />
            </button>
          </div>
          <input
            ref="searchInput"
            v-model="filterText"
            :aria-activedescendant="
              selectedIndex > -1
                ? 'localsearch-item-' + selectedIndex
                : undefined
            "
            aria-autocomplete="both"
            :aria-controls="results?.length ? 'localsearch-list' : undefined"
            aria-labelledby="localsearch-label"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            class="search-input"
            id="localsearch-input"
            enterkeyhint="go"
            maxlength="64"
            :placeholder="translate('button.buttonText')"
            spellcheck="false"
            type="search"
          />
          <div class="search-actions">
            <button
              class="clear-button"
              type="reset"
              :disabled="disableReset"
              :title="translate('modal.resetButtonTitle')"
              @click="resetSearch"
            >
              <span class="vpi-delete local-search-icon" />
            </button>
          </div>
        </form>

        <ul
          ref="resultsEl"
          :id="results?.length ? 'localsearch-list' : undefined"
          :role="results?.length ? 'listbox' : undefined"
          :aria-labelledby="results?.length ? 'localsearch-label' : undefined"
          class="results"
          @mousemove="onMouseMove"
        >
          <li
            v-for="(p, index) in results"
            :key="p.id"
            :id="'localsearch-item-' + index"
            :aria-selected="selectedIndex === index ? 'true' : 'false'"
            role="option"
          >
            <a
              :href="p.id"
              class="result"
              :class="{
                selected: selectedIndex === index
              }"
              :aria-label="[...p.titles, p.title].join(' > ')"
              @mouseenter="!disableMouseOver && (selectedIndex = index)"
              @focusin="selectedIndex = index"
              @click="$emit('close')"
              :data-index="index"
            >
              <div>
                <div class="titles">
                  <span class="title-icon">#</span>
                  <span
                    v-for="(t, index) in p.titles"
                    :key="index"
                    class="title"
                  >
                    <span class="text" v-html="t" />
                    <span class="vpi-chevron-right local-search-icon" />
                  </span>
                  <span class="title main">
                    <span class="text" v-html="p.title" />
                  </span>
                </div>

                <div class="excerpt-wrapper">
                  <div v-if="p.text" class="excerpt" inert>
                    <div class="vp-doc" v-html="p.text" />
                  </div>
                </div>
              </div>
            </a>
          </li>
          <li
            v-if="filterText && !results.length && enableNoResults"
            class="no-results"
          >
            {{ translate('modal.noResultsText') }}
            "<strong>{{ filterText }}</strong
            >"
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
  .VPLocalSearchBox {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: flex;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: var(--vp-backdrop-bg-color);
    transition: opacity 0.5s;
  }

  .shell {
    position: relative;
    padding: 12px;
    margin: 64px auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--vp-local-search-bg);
    width: min(100vw - 60px, 900px);
    height: min-content;
    max-height: min(100vh - 128px, 900px);
    border-radius: 6px;
  }

  @media (max-width: 767px) {
    .shell {
      margin: 0;
      width: 100vw;
      height: 100vh;
      max-height: none;
      border-radius: 0;
    }
  }

  .search-bar {
    border: 1px solid var(--vp-c-divider);
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    cursor: text;
  }

  @media (max-width: 767px) {
    .search-bar {
      padding: 0 8px;
    }
  }

  .search-bar:focus-within {
    border-color: var(--vp-c-brand-1);
  }

  .local-search-icon {
    display: block;
    font-size: 18px;
  }

  .navigate-icon {
    display: block;
    font-size: 14px;
  }

  .search-icon {
    margin: 8px;
  }

  @media (max-width: 767px) {
    .search-icon {
      display: none;
    }
  }

  .search-input {
    padding: 6px 12px;
    font-size: inherit;
    width: 100%;
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  @media (max-width: 767px) {
    .search-input {
      padding: 6px 4px;
    }
  }

  .search-actions {
    display: flex;
    gap: 4px;
  }

  @media (any-pointer: coarse) {
    .search-actions {
      gap: 8px;
    }
  }

  @media (min-width: 769px) {
    .search-actions.before {
      display: none;
    }
  }

  .search-actions button {
    padding: 8px;
  }

  .search-actions button:not([disabled]):hover {
    color: var(--vp-c-brand-1);
  }

  .search-actions button.clear-button:disabled {
    opacity: 0.37;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .result {
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 4px;
    transition: none;
    line-height: 1rem;
    border: solid 2px var(--vp-local-search-result-border);
    outline: none;
  }

  .result > div {
    margin: 12px;
    width: 100%;
    overflow: hidden;
  }

  @media (max-width: 767px) {
    .result > div {
      margin: 8px;
    }
  }

  .titles {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    position: relative;
    z-index: 1001;
    padding: 2px 0;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .title.main {
    font-weight: 500;
  }

  .title-icon {
    opacity: 0.5;
    font-weight: 500;
    color: var(--vp-c-brand-1);
  }

  .title svg {
    opacity: 0.5;
  }

  .result.selected {
    --vp-local-search-result-bg: var(--vp-local-search-result-selected-bg);
    border-color: var(--vp-local-search-result-selected-border);
  }

  .excerpt-wrapper {
    position: relative;
  }

  .excerpt {
    opacity: 50%;
    pointer-events: none;
    max-height: 140px;
    overflow: hidden;
    position: relative;
    margin-top: 4px;
  }

  .result.selected .excerpt {
    opacity: 1;
  }

  .excerpt :deep(*) {
    font-size: 0.8rem !important;
    line-height: 130% !important;
  }

  .titles :deep(mark),
  .excerpt :deep(mark) {
    background-color: var(--vp-local-search-highlight-bg);
    color: var(--vp-local-search-highlight-text);
    border-radius: 2px;
    padding: 0 2px;
  }

  .excerpt :deep(.vp-code-group) .tabs {
    display: none;
  }

  .excerpt :deep(.vp-code-group) div[class*="language-"] {
    border-radius: 8px !important;
  }

  .result.selected .titles,
  .result.selected .title-icon {
    color: var(--vp-c-brand-1) !important;
  }

  .no-results {
    font-size: 0.9rem;
    text-align: center;
    padding: 12px;
  }

  svg {
    flex: none;
  }
</style>
