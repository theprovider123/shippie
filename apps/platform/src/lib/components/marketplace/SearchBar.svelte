<script lang="ts">
  /**
   * Search input that posts back to /apps?q=. Plain GET form so the
   * URL stays bookmarkable; SvelteKit's load() reads the query string.
   */
  interface Props {
    initial?: string;
    placeholder?: string;
  }

  let { initial = '', placeholder = 'Search apps...' }: Props = $props();
  let q = $state(initial);
</script>

<form action="/apps" method="get" class="search-form" role="search">
  <input
    type="search"
    name="q"
    bind:value={q}
    {placeholder}
    aria-label="Search apps"
    class="search-input"
  />
  <button type="submit" class="search-btn" aria-label="Search">→</button>
</form>

<style>
  .search-form {
    display: flex;
    align-items: stretch;
    width: 100%;
    max-width: 480px;
    border: 1px solid var(--border);
    background: transparent;
  }
  .search-form:focus-within { border-color: var(--sunset); }
  .search-input {
    flex: 1;
    padding: 0 var(--space-md);
    height: 48px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--small-size);
  }
  .search-input::placeholder { color: var(--text-light); }
  .search-btn {
    width: 48px;
    background: transparent;
    border: none;
    border-left: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 1rem;
    transition: color 0.2s;
  }
  .search-btn:hover { color: var(--sunset); }
</style>
