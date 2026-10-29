import { createRecipeCard } from "./recipe-card.js";
import { t } from "./i18n.js";

const RECIPES_PER_PAGE = 20;

export function createRecipeCollection({
  root,
  count,
  searchInput,
  categoryFilter,
  pagination,
  onEdit,
  onDelete,
}) {
  let recipes = [];
  let categories = [];
  let selectedCategory = "";
  let searchText = "";
  let currentPage = 0;

  const previousPageButton = pagination.querySelector("#recipe-page-previous");
  const nextPageButton = pagination.querySelector("#recipe-page-next");
  const pageStatus = pagination.querySelector("#recipe-page-status");

  function render() {
    root.replaceChildren();

    const normalizedSearch = searchText.toLowerCase();
    const visibleRecipes = recipes.filter((recipe) => {
      const matchesSearch = normalizedSearch === ""
        || recipe.name.toLowerCase().includes(normalizedSearch)
        || recipe.notes.toLowerCase().includes(normalizedSearch);
      const matchesCategory = selectedCategory === "uncategorized"
        ? recipe.category === null
        : selectedCategory.startsWith("category:")
          ? recipe.category === selectedCategory.slice("category:".length)
          : true;
      return matchesSearch && matchesCategory;
    });
    const collator = new Intl.Collator(document.documentElement.lang || undefined, {
      numeric: true,
      sensitivity: "base",
    });
    visibleRecipes.sort((first, second) => collator.compare(first.name, second.name));
    count.textContent = String(visibleRecipes.length);

    const pageCount = Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE);
    currentPage = pageCount === 0 ? 0 : Math.min(currentPage, pageCount - 1);
    pagination.hidden = pageCount <= 1;
    pageStatus.textContent = t("pagination.status", {
      page: currentPage + 1,
      total: pageCount,
    });
    previousPageButton.disabled = currentPage === 0;
    nextPageButton.disabled = currentPage >= pageCount - 1;

    if (visibleRecipes.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";

      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✳";

      const heading = document.createElement("h3");
      heading.textContent = recipes.length === 0
        ? t("empty.readyTitle")
        : searchText
          ? t("empty.searchTitle")
          : t("empty.categoryTitle");
      const description = document.createElement("p");
      description.textContent = recipes.length === 0
        ? t("empty.readyDescription")
        : searchText
          ? t("empty.searchDescription")
          : t("empty.categoryDescription");
      emptyState.append(icon, heading, description);
      root.append(emptyState);
      return;
    }

    const firstRecipe = currentPage * RECIPES_PER_PAGE;
    root.append(...visibleRecipes
      .slice(firstRecipe, firstRecipe + RECIPES_PER_PAGE)
      .map(createRecipeCard));
  }

  function setCategories(newCategories) {
    categories = newCategories;
    const removedSelectedCategory = selectedCategory.startsWith("category:")
      && !categories.includes(selectedCategory.slice("category:".length));
    if (removedSelectedCategory) {
      selectedCategory = "";
      currentPage = 0;
    }

    categoryFilter.replaceChildren(
      new Option(t("category.all"), ""),
      new Option(t("category.uncategorized"), "uncategorized"),
      ...categories.map((category) => new Option(category, `category:${category}`)),
    );
    categoryFilter.value = selectedCategory;
    if (removedSelectedCategory) {
      render();
    }
  }

  searchInput.addEventListener("input", () => {
    searchText = searchInput.value.trim();
    currentPage = 0;
    render();
  });
  categoryFilter.addEventListener("change", () => {
    selectedCategory = categoryFilter.value;
    currentPage = 0;
    render();
  });
  previousPageButton.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage -= 1;
      render();
    }
  });
  nextPageButton.addEventListener("click", () => {
    currentPage += 1;
    render();
  });
  root.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      const recipe = recipes.find((item) => item.id === deleteButton.dataset.deleteId);
      if (recipe) {
        void onDelete(recipe, deleteButton);
      }
      return;
    }

    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      const recipe = recipes.find((item) => item.id === editButton.dataset.editId);
      if (recipe) {
        onEdit(recipe);
      }
    }
  });

  return {
    setRecipes(newRecipes) {
      recipes = newRecipes;
      currentPage = 0;
      render();
    },
    setCategories,
    refresh() {
      setCategories(categories);
      render();
    },
    upsertRecipe(recipe) {
      const exists = recipes.some((item) => item.id === recipe.id);
      recipes = exists
        ? recipes.map((item) => item.id === recipe.id ? recipe : item)
        : [recipe, ...recipes];
      currentPage = 0;
      render();
    },
    removeRecipe(recipeId) {
      recipes = recipes.filter((recipe) => recipe.id !== recipeId);
      render();
    },
  };
}
