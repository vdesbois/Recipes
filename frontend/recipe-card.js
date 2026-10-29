export function createRecipeCard(recipe) {
  const card = document.createElement("article");
  card.className = "recipe-card";

  const top = document.createElement("div");
  top.className = "recipe-card-top";

  const title = document.createElement("h3");
  const viewLink = document.createElement("a");
  viewLink.className = "recipe-card-link";
  viewLink.href = `/recipe.html?id=${encodeURIComponent(recipe.id)}`;
  viewLink.textContent = recipe.name;
  viewLink.setAttribute("aria-label", `View ${recipe.name}`);
  title.append(viewLink);

  const editButton = document.createElement("button");
  editButton.className = "edit-button";
  editButton.type = "button";
  editButton.dataset.editId = recipe.id;
  editButton.textContent = "Edit";
  editButton.setAttribute("aria-label", `Edit ${recipe.name}`);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.dataset.deleteId = recipe.id;
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete ${recipe.name}`);

  const actions = document.createElement("div");
  actions.className = "recipe-actions";
  actions.append(editButton, deleteButton);
  top.append(title, actions);
  card.append(top);

  if (recipe.images.length > 0) {
    const picture = document.createElement("img");
    picture.className = "recipe-picture";
    picture.src = recipe.images[0].url;
    picture.alt = recipe.name;
    picture.loading = "lazy";
    card.append(picture);
  }

  const rating = document.createElement("p");
  rating.className = recipe.rating === null ? "recipe-rating unrated" : "recipe-rating";
  rating.setAttribute(
    "aria-label",
    recipe.rating === null ? "Not rated" : `${recipe.rating} out of 5 stars`,
  );
  rating.textContent = recipe.rating === null
    ? "Not rated"
    : `${"★".repeat(recipe.rating)}${"☆".repeat(5 - recipe.rating)}`;
  card.append(rating);

  if (recipe.notes) {
    const notes = document.createElement("p");
    notes.className = "recipe-notes";
    notes.textContent = recipe.notes;
    card.append(notes);
  }

  return card;
}
